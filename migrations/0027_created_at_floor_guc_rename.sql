-- Rename the replica-fence floor GUC from `buzz.created_at_floor` to
-- `nuxx.created_at_floor`, without a window in which the guard silently stops
-- enforcing.
--
-- The hazard is the rollout order, not the rename. A relay setting only the new
-- GUC against the old trigger function would have its inserts pass unchecked:
-- the function reads a name nobody sets, `floor_secs` comes back NULL, and the
-- guard becomes a no-op. That failure is invisible — no error, no log, just
-- below-fence rows becoming possible again, which is exactly what migration 0021
-- exists to prevent.
--
-- So the function is replaced to read either name, preferring the new one, and
-- the writer pool sets both for the duration of the transition. Every
-- combination of old/new relay against old/new database keeps enforcing:
--
--   old relay + new function  -> falls back to buzz.*            enforced
--   new relay + old function  -> relay still sets buzz.*         enforced
--   new relay + new function  -> prefers nuxx.*                  enforced
--
-- Dropping the `buzz.*` fallback (and the relay's second set_config) is a
-- follow-up for after every relay is on the new build, not part of this change.
--
-- Only the function body changes. The constraint trigger created in 0021 keeps
-- pointing at the same function name, so partition coverage and the
-- DEFERRABLE INITIALLY DEFERRED commit-time semantics are untouched.

CREATE OR REPLACE FUNCTION events_created_at_floor_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    -- COALESCE across both spellings rather than reading one: see the header.
    -- `current_setting(..., true)` returns NULL for a GUC that was never set,
    -- and nullif() maps a deliberately blank value to NULL as well, so an
    -- operator can still disable the guard by blanking whichever name is in use.
    floor_secs numeric := COALESCE(
        nullif(current_setting('nuxx.created_at_floor', true), ''),
        nullif(current_setting('buzz.created_at_floor', true), '')
    )::numeric;
BEGIN
    IF floor_secs IS NOT NULL
       AND floor_secs > 0
       AND NEW.channel_id IS NOT NULL
       AND NEW.created_at < clock_timestamp() - make_interval(secs => floor_secs)
    THEN
        RAISE EXCEPTION
            'events.created_at % is more than % s before commit time %; below the replica-fence floor',
            NEW.created_at, floor_secs, clock_timestamp()
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NULL;
END
$$;
