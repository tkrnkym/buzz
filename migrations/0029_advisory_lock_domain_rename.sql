-- Rename the two advisory-lock key domains that the events triggers hash into
-- lock keys: 'buzz_push_gate:' -> 'nuxx_push_gate:' and 'buzz_channel_ttl:' ->
-- 'nuxx_channel_ttl:'.
--
-- This is a repair, not just a rebrand. Each domain names one lock shared
-- between a trigger and relay code, and the two sides had drifted apart:
--
--   * 0023's trigger takes 'buzz_push_gate:' SHARED on event insert, while
--     PUSH_GATE_LOCK_NAMESPACE in crates/nuxx-db/src/push.rs takes
--     'nuxx_push_gate:' EXCLUSIVE on lease activation. Different strings hash
--     to different keys, so the shared and exclusive acquisitions stopped
--     conflicting — exactly the conflict 0023's lost-wake proof depends on. A
--     lease activating concurrently with an event insert could again be missed,
--     dropping that user's wake with no retry and no error.
--   * 0024's trigger takes 'buzz_channel_ttl:' SHARED at commit, while
--     update_channel in crates/nuxx-db/src/channel.rs takes 'nuxx_channel_ttl:'
--     EXCLUSIVE before a permanent->ephemeral transition. Same break: the
--     stale-NULL hole 0024 closes was reopened, so a message committing
--     alongside a TTL change could leave ttl_deadline unset.
--
-- Neither break is observable as a failure — both are silent losses of mutual
-- exclusion — so this migration is what makes the invariants hold again.
--
-- Renaming the domain in the trigger is safe for a rolling deploy: the trigger
-- function is a single database object, so every relay version inserting events
-- goes through whichever body is installed. There is no window where two relays
-- hash different strings; the mixed-version risk is on the relay side, and the
-- relay already uses the new names.
--
-- Function bodies below are 0023's and 0024's verbatim except for the domain
-- literal. In particular 0024 keeps its BEGIN/EXCEPTION block (a TTL refresh
-- failure must not reject a valid event) and its RETURN NULL (deferred
-- constraint trigger).

CREATE OR REPLACE FUNCTION enqueue_push_match_job() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    -- Keep this allowlist identical to the relay's validated NIP-PL descriptor.
    IF NEW.kind IN (7, 9, 1059, 40007, 46010) THEN
        PERFORM pg_advisory_xact_lock_shared(
            hashtextextended('nuxx_push_gate:' || NEW.community_id::text, 0));
        IF EXISTS (
            SELECT 1 FROM push_leases
            WHERE community_id = NEW.community_id
              AND active
              AND endpoint_enabled
              AND expires_at > EXTRACT(EPOCH FROM now())::bigint
        ) THEN
            INSERT INTO push_match_queue (community_id, event_id)
            VALUES (NEW.community_id, NEW.id)
            ON CONFLICT DO NOTHING;
        END IF;
    END IF;
    RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION refresh_channel_ttl_after_event_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    channel_ttl INTEGER;
BEGIN
    -- Kind 9007 creates the channel and initializes its deadline itself.
    IF NEW.channel_id IS NOT NULL AND NEW.kind <> 9007 THEN
        BEGIN
            PERFORM pg_advisory_xact_lock_shared(hashtextextended(
                'nuxx_channel_ttl:' || NEW.community_id::text || ':' || NEW.channel_id::text, 0));

            SELECT ttl_seconds INTO channel_ttl
            FROM channels
            WHERE community_id = NEW.community_id AND id = NEW.channel_id;

            IF channel_ttl IS NOT NULL THEN
                UPDATE channels
                SET ttl_deadline = clock_timestamp() + make_interval(secs => ttl_seconds)
                WHERE community_id = NEW.community_id
                  AND id = NEW.channel_id
                  AND ttl_seconds IS NOT NULL
                  AND archived_at IS NULL
                  AND deleted_at IS NULL;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            -- Preserve the existing best-effort contract: a TTL refresh failure
            -- must not reject an otherwise valid durable event.
            RAISE WARNING 'channel TTL refresh failed for community %, channel %: %',
                NEW.community_id, NEW.channel_id, SQLERRM;
        END;
    END IF;
    RETURN NULL;
END
$$;
