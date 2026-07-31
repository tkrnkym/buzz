-- Complete the mesh-status rename: the retention trigger now matches only the
-- `nuxx-` spellings, and the function and trigger are renamed off `buzz` too.
--
-- 0028 deliberately matched BOTH spellings, because `buzz-mesh-member-status:`
-- (a NIP-33 `d` tag) and `buzz-mesh-status` (a `k` tag value) live inside
-- *signed* kind:30003 events and cannot be rewritten — re-signing needs the
-- author's key and editing invalidates the signature. Narrowing to one spelling
-- is therefore a deliberate trade, not a cleanup, and it is requested:
--
--   Cost: when a kind:30003 status event written BEFORE the rename is
--   soft-deleted from here on, this trigger no longer recognizes it, so its row
--   and mention rows are never purged. They accumulate as soft-deleted history
--   with no error and no log line — the same silent failure 0028 was written to
--   prevent, now accepted for the pre-rename corpus only.
--
--   Mitigation below: every legacy row that is ALREADY soft-deleted is purged
--   once here, so the residual exposure is limited to pre-rename events that
--   get soft-deleted after this migration runs. Mesh status is a 45-second
--   heartbeat, so that set drains as members re-publish under the new spelling.
--
-- The function rename needs DROP TRIGGER + DROP FUNCTION + recreate, since a
-- trigger holds a dependency on its function. That takes a brief ACCESS
-- EXCLUSIVE lock on `events`; it is a catalog-only change with no table rewrite.
-- The recreated body is 0019's verbatim apart from the narrowed predicate — in
-- particular it keeps `created_at = NEW.created_at`, which lets the planner
-- prune to the single partition holding the row, and keeps 0019's delete order
-- (mentions after events) and its AFTER UPDATE OF deleted_at timing.

-- One-time purge of legacy rows already soft-deleted, before the predicate stops
-- matching them.
DELETE FROM event_mentions mention
USING events status
WHERE mention.community_id = status.community_id
  AND mention.event_id = status.id
  AND status.kind = 30003
  AND status.d_tag LIKE 'buzz-mesh-member-status:%'
  AND status.deleted_at IS NOT NULL
  AND status.tags @> '[["k", "buzz-mesh-status"]]'::jsonb;

DELETE FROM events
WHERE kind = 30003
  AND d_tag LIKE 'buzz-mesh-member-status:%'
  AND deleted_at IS NOT NULL
  AND tags @> '[["k", "buzz-mesh-status"]]'::jsonb;

DROP TRIGGER IF EXISTS trg_events_purge_soft_deleted_buzz_mesh_status ON events;
DROP FUNCTION IF EXISTS purge_soft_deleted_buzz_mesh_status();

CREATE FUNCTION purge_soft_deleted_nuxx_mesh_status() RETURNS trigger AS $$
BEGIN
    IF OLD.deleted_at IS NULL
       AND NEW.deleted_at IS NOT NULL
       AND NEW.kind = 30003
       AND NEW.d_tag LIKE 'nuxx-mesh-member-status:%'
       AND NEW.tags @> '[["k", "nuxx-mesh-status"]]'::jsonb THEN
        DELETE FROM events
        WHERE community_id = NEW.community_id
          AND created_at = NEW.created_at
          AND id = NEW.id;

        DELETE FROM event_mentions
        WHERE community_id = NEW.community_id AND event_id = NEW.id;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_events_purge_soft_deleted_nuxx_mesh_status
    AFTER UPDATE OF deleted_at ON events
    FOR EACH ROW EXECUTE FUNCTION purge_soft_deleted_nuxx_mesh_status();
