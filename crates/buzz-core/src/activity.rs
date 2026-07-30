//! Channel activity snapshots — the shard model.
//!
//! An unread badge needs one fact per channel: when did anything last happen
//! there. Clients hold their own read cursors, so the relay never needs to know
//! who has read what — it only has to publish the timestamps.
//!
//! # Why not one event per channel
//!
//! The obvious shape copies [`crate::kind::KIND_THREAD_SUMMARY`]: one
//! relay-signed overlay per channel. It does not scale, for a reason that is
//! easy to miss — **the signature costs more than the fact it attests**. A Nostr
//! event spends 256 bytes on `id`/`pubkey`/`sig` hex alone; the payload here is
//! a UUID and an integer. A community with 3000 channels would pay ~750 KB and
//! 3000 subscription dispatches on first connect to learn 3000 timestamps.
//!
//! # The shard model
//!
//! Channels are grouped into a fixed number of shards, and one event carries a
//! whole shard. 3000 channels become [`ACTIVITY_SHARD_COUNT`] events instead of
//! 3000, and a write to one channel regenerates only that channel's shard.
//!
//! Two properties are load-bearing:
//!
//! - **The shard count is fixed, not derived from the channel count.** Sizing
//!   shards by "200 channels each" would make the count change as the community
//!   grows, and every channel would land in a different shard the moment it did
//!   — invalidating every snapshot at once. With a fixed count, adding a channel
//!   touches exactly one shard, forever.
//! - **Assignment is by hash of the channel id, not by position.** "Channels
//!   1–200 are shard A" re-numbers every later channel whenever one is created
//!   or deleted. A hash has no such coupling.
//!
//! # Visibility
//!
//! A snapshot is a real disclosure: "this channel moved recently" is
//! information even when the message bodies are not. Shards are therefore split
//! by visibility class rather than filtered per reader:
//!
//! - [`ActivityShard::Shared`] carries only `visibility = 'open'` channels.
//!   Those are already returned to every pubkey in the community by
//!   `get_accessible_channel_ids`, so a shared shard discloses nothing a
//!   `POST /query` would not. One signature serves every reader.
//! - [`ActivityShard::Member`] carries the channels a specific reader belongs to
//!   that are *not* open. It is addressed to that reader and delivered only to
//!   them.
//!
//! Splitting this way keeps the shared shard genuinely shared: it never needs
//! per-reader filtering, so it never needs per-reader re-signing.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Number of shards a community's channels are divided into.
///
/// Fixed on purpose — see the module docs. Sixteen keeps a large community's
/// shards at a workable size (3000 channels ≈ 188 each) while costing a small
/// community only a handful of nearly-empty events.
pub const ACTIVITY_SHARD_COUNT: u32 = 16;

/// Which shard a channel belongs to.
///
/// Derived from the last 8 bytes of the UUID, which are random in both v4 and
/// v7 layouts — unlike the leading bytes, which v7 fills with a timestamp and
/// would pile freshly-created channels into the same shard.
///
/// This must stay stable across releases: a change re-shards every community
/// and invalidates every stored snapshot. It is deliberately arithmetic on the
/// id's own bytes rather than a `Hasher`, whose output Rust does not promise to
/// keep stable between versions.
pub fn shard_of(channel_id: &Uuid) -> u32 {
    let bytes = channel_id.as_bytes();
    let mut tail = [0u8; 8];
    tail.copy_from_slice(&bytes[8..16]);
    (u64::from_be_bytes(tail) % u64::from(ACTIVITY_SHARD_COUNT)) as u32
}

/// The identity of one snapshot: which shard, and who may see it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ActivityShard {
    /// Open channels — identical for every reader in the community.
    Shared {
        /// Shard index.
        shard: u32,
    },
    /// One reader's non-open channels.
    Member {
        /// Shard index.
        shard: u32,
        /// The reader this shard is addressed to.
        pubkey_hex: String,
    },
}

impl ActivityShard {
    /// The shard index, whichever class this is.
    pub fn index(&self) -> u32 {
        match self {
            Self::Shared { shard } | Self::Member { shard, .. } => *shard,
        }
    }

    /// The addressable `d` tag.
    ///
    /// Distinct prefixes keep the two classes in separate replaceable slots, so
    /// a reader's member shard can never overwrite the shared one.
    pub fn d_tag(&self) -> String {
        match self {
            Self::Shared { shard } => format!("activity:{shard}"),
            Self::Member { shard, pubkey_hex } => format!("activity:{shard}:{pubkey_hex}"),
        }
    }
}

/// The body of a snapshot event.
///
/// `channels` is a `BTreeMap` so the serialized form is deterministic: an
/// unchanged shard produces byte-identical content, which makes "did this
/// actually change?" answerable without a field-by-field diff.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ActivitySnapshot {
    /// Shard index, echoed so a client can tell shards apart without parsing
    /// the `d` tag.
    pub shard: u32,
    /// Channel id → unix seconds of the last activity in it.
    pub channels: BTreeMap<Uuid, i64>,
}

impl ActivitySnapshot {
    /// Build a snapshot body for one shard.
    pub fn new(shard: u32, channels: BTreeMap<Uuid, i64>) -> Self {
        Self { shard, channels }
    }

    /// True when the shard holds nothing.
    ///
    /// An empty shard is normal — with a fixed shard count, a small community
    /// leaves most of them empty — and is still published, so a client can tell
    /// "nothing here" from "not loaded yet".
    pub fn is_empty(&self) -> bool {
        self.channels.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn uuid_with_tail(tail: u64) -> Uuid {
        let mut bytes = [0u8; 16];
        bytes[8..16].copy_from_slice(&tail.to_be_bytes());
        Uuid::from_bytes(bytes)
    }

    #[test]
    fn every_channel_lands_in_range() {
        for tail in 0..1000u64 {
            assert!(shard_of(&uuid_with_tail(tail)) < ACTIVITY_SHARD_COUNT);
        }
    }

    #[test]
    fn assignment_is_stable_for_the_same_id() {
        let id = Uuid::parse_str("11111111-2222-3333-4444-555555555555").unwrap();
        assert_eq!(shard_of(&id), shard_of(&id));
    }

    #[test]
    fn v7_style_ids_created_together_still_spread() {
        // A v7 UUID's leading bytes are a timestamp, so channels created in the
        // same millisecond share them. Sharding on the leading bytes would put
        // every channel from a bulk import into one shard; the tail must not.
        let mut seen = std::collections::HashSet::new();
        for nth in 0..64u64 {
            let mut bytes = [0u8; 16];
            // Identical timestamp prefix for all of them.
            bytes[0..8].copy_from_slice(&0x0192_3f4a_1000_0000u64.to_be_bytes());
            bytes[8..16].copy_from_slice(&(nth.wrapping_mul(0x9E37_79B9_7F4A_7C15)).to_be_bytes());
            seen.insert(shard_of(&Uuid::from_bytes(bytes)));
        }
        assert_eq!(
            seen.len(),
            ACTIVITY_SHARD_COUNT as usize,
            "channels created in one burst must not collapse into one shard"
        );
    }

    #[test]
    fn adding_a_channel_moves_no_existing_channel() {
        // The property that positional sharding ("channels 1-200 are shard A")
        // fails: there, inserting one channel renumbers every later one.
        let existing: Vec<Uuid> = (0..200).map(uuid_with_tail).collect();
        let before: Vec<u32> = existing.iter().map(shard_of).collect();

        let _newcomer = uuid_with_tail(9_999);

        let after: Vec<u32> = existing.iter().map(shard_of).collect();
        assert_eq!(before, after);
    }

    #[test]
    fn the_two_visibility_classes_never_share_a_slot() {
        let shared = ActivityShard::Shared { shard: 3 };
        let member = ActivityShard::Member {
            shard: 3,
            pubkey_hex: "ab".repeat(32),
        };
        assert_ne!(shared.d_tag(), member.d_tag());
        assert_eq!(shared.index(), member.index());
    }

    #[test]
    fn two_readers_get_distinct_member_slots() {
        let one = ActivityShard::Member {
            shard: 1,
            pubkey_hex: "aa".repeat(32),
        };
        let two = ActivityShard::Member {
            shard: 1,
            pubkey_hex: "bb".repeat(32),
        };
        assert_ne!(one.d_tag(), two.d_tag());
    }

    #[test]
    fn an_unchanged_shard_serializes_identically() {
        // Regeneration compares serialized bodies to decide whether to publish;
        // a nondeterministic map order would make every rebuild look like a
        // change and defeat the coalescing.
        let mut channels = BTreeMap::new();
        channels.insert(uuid_with_tail(2), 1_700_000_200);
        channels.insert(uuid_with_tail(1), 1_700_000_100);
        let first = serde_json::to_string(&ActivitySnapshot::new(0, channels.clone())).unwrap();

        let mut reordered = BTreeMap::new();
        reordered.insert(uuid_with_tail(1), 1_700_000_100);
        reordered.insert(uuid_with_tail(2), 1_700_000_200);
        let second = serde_json::to_string(&ActivitySnapshot::new(0, reordered)).unwrap();

        assert_eq!(first, second);
    }

    #[test]
    fn a_snapshot_round_trips() {
        let mut channels = BTreeMap::new();
        channels.insert(uuid_with_tail(7), 1_700_000_000);
        let snapshot = ActivitySnapshot::new(4, channels);

        let json = serde_json::to_string(&snapshot).unwrap();
        let parsed: ActivitySnapshot = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed, snapshot);
    }
}
