//! Publishing channel activity snapshots.
//!
//! The read side of the shard model in [`buzz_core::activity`]. A channel write
//! records a timestamp in Redis; some time later exactly one pod rebuilds the
//! affected shard and publishes it.
//!
//! # Nothing here is stored
//!
//! Snapshots are relay-signed and either fanned out live or synthesized for a
//! `POST /query`, never written to Postgres — the same treatment as presence and
//! the channel-window overlays. Storing them would mean a row per reader per
//! shard whose only content is a timestamp map that is already derivable, and
//! addressable replacement would make the table churn once per coalesce window.
//!
//! # Keeping the rebuild off the user axis
//!
//! The whole point of this feature is to stop unread costing
//! `O(readers × channels)`. A rebuild that regenerated every reader's view would
//! reintroduce exactly that, so the two shard classes are built differently:
//!
//! - The **shared** shard is built once per rebuild. Its cost does not depend on
//!   how many people are connected.
//! - **Member** shards are built only for the readers of the private channels
//!   that actually moved in this window — found by asking those channels for
//!   their member lists, not by walking the community. A private channel has few
//!   members by construction, so this tracks private-channel write volume rather
//!   than population.
//!
//! A community whose activity is all in open channels therefore does one
//! rebuild per window no matter how many people are watching.

use std::collections::{BTreeMap, HashMap, HashSet};
use std::sync::Arc;
use std::time::Duration;

use buzz_core::activity::{ActivityShard, ActivitySnapshot};
use buzz_core::event::StoredEvent;
use buzz_core::kind::KIND_CHANNEL_ACTIVITY_SNAPSHOT;
use buzz_core::tenant::TenantContext;
use buzz_pubsub::activity as redis_activity;
use buzz_pubsub::EventTopic;
use nostr::{EventBuilder, Kind, Tag};
use tracing::warn;
use uuid::Uuid;

use crate::state::AppState;

/// Record a channel write and, if this pod wins the coalescing claim, rebuild
/// the affected shard once the window closes.
///
/// Spawned rather than awaited: the write has already been acknowledged and a
/// badge is not worth adding latency to an ingest, matching
/// `emit_live_thread_summary`.
pub fn record_channel_activity(
    tenant: &TenantContext,
    state: &Arc<AppState>,
    channel_id: Uuid,
    at_unix_seconds: i64,
) {
    let tenant = tenant.clone();
    let state = Arc::clone(state);
    tokio::spawn(async move {
        let shard = match redis_activity::record_activity(
            &state.redis_pool,
            &tenant,
            channel_id,
            at_unix_seconds,
        )
        .await
        {
            Ok(shard) => shard,
            Err(e) => {
                warn!(%channel_id, "activity record failed: {e}");
                return;
            }
        };

        // Whoever takes the claim owns this window. Everyone else returns
        // immediately and does not retry: the winner rebuilds from the same
        // Redis state they would have read, so a second rebuild would publish
        // identical content.
        match redis_activity::claim_rebuild(&state.redis_pool, &tenant, shard).await {
            Ok(true) => {}
            Ok(false) => return,
            Err(e) => {
                warn!(shard, "activity claim failed: {e}");
                return;
            }
        }

        // Trailing edge: wait out the window first, so writes that land during
        // it are folded into this rebuild rather than each producing their own.
        // Rebuilding immediately would emit a snapshot that is already stale and
        // leave the window's activity for the next message to trigger.
        tokio::time::sleep(Duration::from_millis(redis_activity::ACTIVITY_COALESCE_MS)).await;

        if let Err(e) = rebuild_shard(&tenant, &state, shard).await {
            warn!(shard, "activity rebuild failed: {e}");
            // Put it back so the window's activity is not silently dropped.
            let _ = redis_activity::requeue_shard(&state.redis_pool, &tenant, shard).await;
        }
    });
}

/// Rebuild and publish one shard's snapshots.
pub(crate) async fn rebuild_shard(
    tenant: &TenantContext,
    state: &Arc<AppState>,
    shard: u32,
) -> anyhow::Result<()> {
    let started = std::time::Instant::now();
    let entries = redis_activity::read_shard(&state.redis_pool, tenant, shard).await?;

    metrics::histogram!("buzz_activity_shard_entries").record(entries.len() as f64);
    if entries.is_empty() {
        return Ok(());
    }

    let open_channels: HashSet<Uuid> = state
        .db
        .list_channels(tenant.community(), Some("open"))
        .await?
        .into_iter()
        .map(|channel| channel.id)
        .collect();

    let (shared, restricted) = split_by_visibility(&entries, &open_channels);

    // A window in which only private channels moved has nothing community-wide
    // to say, so it publishes no shared shard at all.
    if !shared.is_empty() {
        publish_snapshot(
            tenant,
            state,
            ActivityShard::Shared { shard },
            ActivitySnapshot::new(shard, shared),
        )
        .await;
    }

    if !restricted.is_empty() {
        rebuild_member_shards(tenant, state, shard, &restricted).await?;
    }

    metrics::histogram!("buzz_activity_rebuild_duration_seconds")
        .record(started.elapsed().as_secs_f64());
    metrics::counter!("buzz_activity_shard_rebuilds_total").increment(1);
    Ok(())
}

/// Split a shard's timestamps into the community-visible part and the rest.
///
/// Open channels are the ones `get_accessible_channel_ids` hands to every pubkey
/// in the community, so their activity is safe to publish once for everybody.
/// Everything else has an audience that has to be worked out per reader.
fn split_by_visibility(
    entries: &BTreeMap<Uuid, i64>,
    open_channels: &HashSet<Uuid>,
) -> (BTreeMap<Uuid, i64>, BTreeMap<Uuid, i64>) {
    let mut shared = BTreeMap::new();
    let mut restricted = BTreeMap::new();
    for (channel_id, at) in entries {
        if open_channels.contains(channel_id) {
            shared.insert(*channel_id, *at);
        } else {
            restricted.insert(*channel_id, *at);
        }
    }
    (shared, restricted)
}

/// Split a shard's timestamps into what one specific reader may see.
///
/// Used by the `POST /query` initial fetch, where the answer is built *for* the
/// authenticated caller rather than built once and filtered. The reader's
/// identity comes from their NIP-98 signature, never from the request body, so
/// there is no way to ask for someone else's view.
///
/// A channel that is neither open nor accessible to this reader is dropped from
/// both halves — the third case is the one that matters, and it is silent.
pub(crate) fn split_for_reader(
    entries: &BTreeMap<Uuid, i64>,
    open_channels: &HashSet<Uuid>,
    accessible: &HashSet<Uuid>,
) -> (BTreeMap<Uuid, i64>, BTreeMap<Uuid, i64>) {
    let mut shared = BTreeMap::new();
    let mut mine = BTreeMap::new();
    for (channel_id, at) in entries {
        if open_channels.contains(channel_id) {
            shared.insert(*channel_id, *at);
        } else if accessible.contains(channel_id) {
            mine.insert(*channel_id, *at);
        }
    }
    (shared, mine)
}

/// Publish one member shard per reader who can see any of the moved channels.
///
/// Readers are gathered from the moved channels' member lists rather than from
/// the community, which is what keeps this bounded — see the module docs.
async fn rebuild_member_shards(
    tenant: &TenantContext,
    state: &Arc<AppState>,
    shard: u32,
    restricted: &BTreeMap<Uuid, i64>,
) -> anyhow::Result<()> {
    let mut readers: HashMap<Vec<u8>, BTreeMap<Uuid, i64>> = HashMap::new();

    for (channel_id, at) in restricted {
        let members = state
            .db
            .get_members(tenant.community(), *channel_id)
            .await?;
        for member in members {
            readers
                .entry(member.pubkey)
                .or_default()
                .insert(*channel_id, *at);
        }
    }

    metrics::histogram!("buzz_activity_member_shard_readers").record(readers.len() as f64);

    for (pubkey, channels) in readers {
        publish_snapshot(
            tenant,
            state,
            ActivityShard::Member {
                shard,
                pubkey_hex: hex::encode(&pubkey),
            },
            ActivitySnapshot::new(shard, channels),
        )
        .await;
    }
    Ok(())
}

/// Sign a snapshot and route it to subscribers on every pod.
///
/// Redis first, then local fan-out, matching `dispatch_persistent_event` — a
/// subscriber on another pod must not be told later than one on this pod.
/// Delivery is still gated per recipient in `filter_fanout_by_access`; publishing
/// here decides nothing about who receives it.
async fn publish_snapshot(
    tenant: &TenantContext,
    state: &Arc<AppState>,
    shard: ActivityShard,
    snapshot: ActivitySnapshot,
) {
    let content = match serde_json::to_string(&snapshot) {
        Ok(content) => content,
        Err(e) => {
            warn!(
                shard = shard.index(),
                "activity snapshot serialize failed: {e}"
            );
            return;
        }
    };

    let d_tag = shard.d_tag();
    let tag = match Tag::parse(["d", &d_tag]) {
        Ok(tag) => tag,
        Err(e) => {
            warn!(%d_tag, "activity snapshot tag failed: {e}");
            return;
        }
    };

    let event =
        match EventBuilder::new(Kind::Custom(KIND_CHANNEL_ACTIVITY_SNAPSHOT as u16), content)
            .tag(tag)
            .sign_with_keys(&state.relay_keypair)
        {
            Ok(event) => event,
            Err(e) => {
                warn!(%d_tag, "activity snapshot sign failed: {e}");
                return;
            }
        };

    state.mark_local_event(tenant.community(), &event.id);
    if let Err(e) = state
        .pubsub
        .publish_event(tenant, EventTopic::Global, &event)
        .await
    {
        state
            .local_event_ids
            .invalidate(&(tenant.community(), event.id.to_bytes()));
        warn!(%d_tag, "activity snapshot Redis publish failed: {e}");
    }

    let stored = StoredEvent::new(event, None);
    crate::handlers::event::fan_out_event_to_local_subscribers(state, tenant.community(), &stored)
        .await;
}

#[cfg(test)]
mod tests {
    use super::*;

    fn channel(tail: u64) -> Uuid {
        let mut bytes = [0u8; 16];
        bytes[8..16].copy_from_slice(&tail.to_be_bytes());
        Uuid::from_bytes(bytes)
    }

    #[test]
    fn open_channels_are_shared_and_the_rest_are_not() {
        let open = channel(1);
        let private = channel(2);
        let entries = BTreeMap::from([(open, 100), (private, 200)]);
        let open_channels = HashSet::from([open]);

        let (shared, restricted) = split_by_visibility(&entries, &open_channels);

        assert_eq!(shared, BTreeMap::from([(open, 100)]));
        assert_eq!(restricted, BTreeMap::from([(private, 200)]));
    }

    #[test]
    fn a_channel_missing_from_the_open_list_is_treated_as_restricted() {
        // Fail closed: an unknown channel must not land in the shared shard,
        // which every reader in the community receives. A channel deleted or
        // flipped to private between the write and the rebuild takes this path.
        let unknown = channel(9);
        let entries = BTreeMap::from([(unknown, 100)]);

        let (shared, restricted) = split_by_visibility(&entries, &HashSet::new());

        assert!(shared.is_empty());
        assert_eq!(restricted, BTreeMap::from([(unknown, 100)]));
    }

    #[test]
    fn a_reader_never_sees_a_channel_they_cannot_access() {
        // The case that matters: a private channel moved, and this reader is not
        // in it. It must appear in neither half — putting it in `shared` would
        // broadcast it, and putting it in `mine` would address it to the wrong
        // person. Both are the activity leak the split exists to prevent.
        let open = channel(1);
        let mine = channel(2);
        let theirs = channel(3);
        let entries = BTreeMap::from([(open, 100), (mine, 200), (theirs, 300)]);

        let (shared, own) = split_for_reader(
            &entries,
            &HashSet::from([open]),
            &HashSet::from([open, mine]),
        );

        assert_eq!(shared, BTreeMap::from([(open, 100)]));
        assert_eq!(own, BTreeMap::from([(mine, 200)]));
        assert!(!shared.contains_key(&theirs) && !own.contains_key(&theirs));
    }

    #[test]
    fn an_open_channel_stays_shared_even_for_a_member() {
        // Membership must not promote an open channel into the per-reader shard:
        // that would emit the same timestamp twice and make the shared shard's
        // "one signature for everyone" property pointless.
        let open = channel(1);
        let entries = BTreeMap::from([(open, 100)]);

        let (shared, own) =
            split_for_reader(&entries, &HashSet::from([open]), &HashSet::from([open]));

        assert_eq!(shared.len(), 1);
        assert!(own.is_empty());
    }

    #[test]
    fn a_reader_with_no_access_at_all_gets_nothing() {
        let entries = BTreeMap::from([(channel(3), 100)]);
        let (shared, own) = split_for_reader(&entries, &HashSet::new(), &HashSet::new());
        assert!(shared.is_empty() && own.is_empty());
    }

    #[test]
    fn an_all_private_window_says_nothing_community_wide() {
        let entries = BTreeMap::from([(channel(3), 100), (channel(4), 200)]);
        let (shared, restricted) = split_by_visibility(&entries, &HashSet::new());
        assert!(shared.is_empty());
        assert_eq!(restricted.len(), 2);
    }
}
