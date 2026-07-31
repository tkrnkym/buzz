//! Channel activity tracking — the write side of unread badges.
//!
//! Every channel write records one timestamp. Regenerating a snapshot from
//! those timestamps is comparatively expensive (read the shard, sign, fan out),
//! so the two are decoupled:
//!
//! - **Record** is unconditional and O(1): one `HSET` per write. No debounce,
//!   because dropping a record would lose activity.
//! - **Regenerate** is coalesced. A shard is marked dirty on record, and a
//!   claim with a short TTL lets exactly one pod rebuild it per window.
//!
//! Coalescing is what makes this bounded. Without it a bot posting 100 messages
//! produces 100 snapshot events, and replacing message bodies with snapshots
//! would have bought nothing. With it, emission is capped at
//! `ACTIVITY_SHARD_COUNT / window` per community **regardless of how fast
//! messages arrive** — the property the whole design rests on.
//!
//! Keys, all community-scoped:
//!
//! ```text
//! buzz:{community}:activity:{shard}          HASH  channel_uuid -> unix_seconds
//! buzz:{community}:activity:dirty            SET   shard indices awaiting rebuild
//! buzz:{community}:activity:claim:{shard}    STR   coalescing claim, TTL = window
//! ```
//!
//! # Storage choice, and when to revisit it
//!
//! A shard is a `HASH` and a rebuild reads all of it (`HGETALL`), even when one
//! channel moved. A sorted set scored by timestamp would instead allow reading
//! only what changed since the last rebuild
//! (`ZRANGEBYSCORE key (last_rebuild +inf`).
//!
//! That is not automatically better here, and the reason is worth stating so
//! the comparison is not re-litigated from scratch: the snapshot event is
//! *addressable*, so each one must carry the shard's *complete* state — a
//! client replacing `d=activity:3` needs the whole picture, not a delta. Reading
//! only the delta therefore does not by itself shrink the work; it helps only if
//! the rendered snapshot is also cached so the delta can be applied to it, which
//! costs another key and another consistency problem across pods.
//!
//! With [`ACTIVITY_SHARD_COUNT`](nuxx_core::activity::ACTIVITY_SHARD_COUNT)
//! shards, a shard holds ~188 fields at 3000 channels, and `HGETALL` of that is
//! not the bottleneck. The switch becomes worth making when it is — concretely,
//! when `buzz_activity_shard_entries` runs into the thousands or
//! `buzz_activity_rebuild_duration_seconds` becomes visible next to the signing
//! cost. Both are recorded on the rebuild path so the decision can be made from
//! production numbers rather than prediction.

use std::collections::BTreeMap;

use deadpool_redis::Pool;
use nuxx_core::activity::shard_of;
use nuxx_core::TenantContext;
use uuid::Uuid;

use crate::error::PubSubError;
use crate::topic::BUZZ_PREFIX;

/// How long a rebuild claim is held, in milliseconds.
///
/// This is the coalescing window: activity recorded while a claim is held is
/// folded into the next rebuild rather than producing its own event. Long
/// enough to absorb a burst, short enough that a badge is not visibly late.
pub const ACTIVITY_COALESCE_MS: u64 = 1_000;

/// How long a shard's timestamps live without any further activity.
///
/// A channel nobody has posted in for a week does not need a badge, so letting
/// the shard expire keeps Redis proportional to *active* channels rather than
/// to every channel ever created. Matches the client's unread horizon.
pub const ACTIVITY_TTL_SECS: u64 = 7 * 24 * 60 * 60;

fn shard_key(ctx: &TenantContext, shard: u32) -> String {
    format!("{BUZZ_PREFIX}:{}:activity:{shard}", ctx.community())
}

fn dirty_key(ctx: &TenantContext) -> String {
    format!("{BUZZ_PREFIX}:{}:activity:dirty", ctx.community())
}

fn claim_key(ctx: &TenantContext, shard: u32) -> String {
    format!("{BUZZ_PREFIX}:{}:activity:claim:{shard}", ctx.community())
}

/// Record activity in a channel and mark its shard for rebuild.
///
/// Returns the shard that was touched.
///
/// `HSET` is unconditional rather than "only if newer": writes arrive in
/// timestamp order in practice, and a rebuild reads whatever is current, so a
/// reordered pair costs at most one second of badge accuracy — not worth a
/// round trip to compare.
pub async fn record_activity(
    pool: &Pool,
    ctx: &TenantContext,
    channel_id: Uuid,
    at_unix_seconds: i64,
) -> Result<u32, PubSubError> {
    let shard = shard_of(&channel_id);
    let mut conn = pool.get().await?;

    let mut pipe = redis::pipe();
    pipe.atomic()
        .cmd("HSET")
        .arg(shard_key(ctx, shard))
        .arg(channel_id.to_string())
        .arg(at_unix_seconds)
        .ignore()
        .cmd("EXPIRE")
        .arg(shard_key(ctx, shard))
        .arg(ACTIVITY_TTL_SECS)
        .ignore()
        .cmd("SADD")
        .arg(dirty_key(ctx))
        .arg(shard)
        .ignore()
        .cmd("EXPIRE")
        .arg(dirty_key(ctx))
        .arg(ACTIVITY_TTL_SECS)
        .ignore();
    pipe.query_async::<()>(&mut conn).await?;

    Ok(shard)
}

/// Try to become the pod that rebuilds `shard` for this window.
///
/// `SET NX PX` is the whole coalescing mechanism: the first caller after the
/// window elapses wins and rebuilds, every other caller — on this pod or any
/// other — is told no and does nothing. Losers do not retry, because the winner
/// will read the same Redis state they would have.
pub async fn claim_rebuild(
    pool: &Pool,
    ctx: &TenantContext,
    shard: u32,
) -> Result<bool, PubSubError> {
    let mut conn = pool.get().await?;
    let claimed: Option<String> = redis::cmd("SET")
        .arg(claim_key(ctx, shard))
        .arg("1")
        .arg("NX")
        .arg("PX")
        .arg(ACTIVITY_COALESCE_MS)
        .query_async(&mut conn)
        .await?;
    Ok(claimed.is_some())
}

/// Read one shard's timestamps.
///
/// Entries that are not parseable as `uuid -> integer` are skipped rather than
/// failing the read: one malformed field must not take out a whole shard's
/// badges.
pub async fn read_shard(
    pool: &Pool,
    ctx: &TenantContext,
    shard: u32,
) -> Result<BTreeMap<Uuid, i64>, PubSubError> {
    let mut conn = pool.get().await?;
    let raw: std::collections::HashMap<String, String> = redis::cmd("HGETALL")
        .arg(shard_key(ctx, shard))
        .query_async(&mut conn)
        .await?;

    let mut out = BTreeMap::new();
    for (channel, at) in raw {
        let (Ok(channel_id), Ok(at_unix)) = (Uuid::parse_str(&channel), at.parse::<i64>()) else {
            tracing::warn!(channel = %channel, "activity shard entry unparseable; skipping");
            continue;
        };
        out.insert(channel_id, at_unix);
    }
    Ok(out)
}

/// Take the set of shards awaiting rebuild, clearing it.
///
/// `SPOP` with a count is atomic, so two pods draining concurrently split the
/// work rather than both rebuilding everything.
pub async fn take_dirty_shards(pool: &Pool, ctx: &TenantContext) -> Result<Vec<u32>, PubSubError> {
    let mut conn = pool.get().await?;
    let members: Vec<String> = redis::cmd("SPOP")
        .arg(dirty_key(ctx))
        .arg(nuxx_core::activity::ACTIVITY_SHARD_COUNT)
        .query_async(&mut conn)
        .await?;
    Ok(members.iter().filter_map(|m| m.parse().ok()).collect())
}

/// Mark a shard dirty again after a failed rebuild, so the work is not lost.
pub async fn requeue_shard(
    pool: &Pool,
    ctx: &TenantContext,
    shard: u32,
) -> Result<(), PubSubError> {
    let mut conn = pool.get().await?;
    redis::cmd("SADD")
        .arg(dirty_key(ctx))
        .arg(shard)
        .query_async::<()>(&mut conn)
        .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use nuxx_core::CommunityId;

    fn ctx() -> TenantContext {
        TenantContext::resolved(CommunityId::from_uuid(Uuid::nil()), "relay.test")
    }

    #[test]
    fn keys_are_community_scoped() {
        // Two communities must never share an activity shard: a leak here would
        // publish one tenant's channel ids to another's subscribers.
        let key = shard_key(&ctx(), 3);
        assert!(key.starts_with("buzz:"));
        assert!(key.contains(&CommunityId::from_uuid(Uuid::nil()).to_string()));
        assert!(key.ends_with(":activity:3"));
    }

    #[test]
    fn each_shard_and_class_of_key_is_distinct() {
        let c = ctx();
        let keys = [
            shard_key(&c, 0),
            shard_key(&c, 1),
            dirty_key(&c),
            claim_key(&c, 0),
            claim_key(&c, 1),
        ];
        let unique: std::collections::HashSet<_> = keys.iter().collect();
        assert_eq!(unique.len(), keys.len());
    }
}
