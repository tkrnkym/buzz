-- Make the mesh-status retention trigger match both the pre-rename and the
-- current `d`/`k` tag spellings.
--
-- `buzz-mesh-member-status:` (a NIP-33 `d` tag) and `buzz-mesh-status` (a `k`
-- tag value) live inside *signed* kind:30003 events. They cannot be rewritten —
-- re-signing needs the author's key and editing invalidates the signature — so
-- every record written before the rename keeps the old spelling permanently,
-- while new records carry the new one.
--
-- A trigger matching only one spelling stops purging half the corpus, and does so
-- silently: soft-deleted rows accumulate with no error and no log line. Matching
-- both is not a deprecation window; it is the permanent shape for as long as
-- pre-rename events exist.
--
-- Migration 0019 created the function and the trigger. Only the predicate is
-- widened here: the body keeps 0019's `created_at = NEW.created_at` clause,
-- which lets the planner prune to the one partition holding the row, and keeps
-- the same delete order. The trigger definition is untouched, so its
-- AFTER UPDATE OF deleted_at timing still applies.

-- One-time sweep for rows written between the code rename and this migration:
-- those carry the new prefix and were invisible to the 0019 predicate, so they
-- were soft-deleted but never purged.
DELETE FROM event_mentions mention
USING events status
WHERE mention.community_id = status.community_id
  AND mention.event_id = status.id
  AND status.kind = 30003
  AND status.d_tag LIKE 'nuxx-mesh-member-status:%'
  AND status.deleted_at IS NOT NULL
  AND status.tags @> '[["k", "nuxx-mesh-status"]]'::jsonb;

DELETE FROM events
WHERE kind = 30003
  AND d_tag LIKE 'nuxx-mesh-member-status:%'
  AND deleted_at IS NOT NULL
  AND tags @> '[["k", "nuxx-mesh-status"]]'::jsonb;

CREATE OR REPLACE FUNCTION purge_soft_deleted_buzz_mesh_status() RETURNS trigger AS $$
BEGIN
    IF OLD.deleted_at IS NULL
       AND NEW.deleted_at IS NOT NULL
       AND NEW.kind = 30003
       AND (NEW.d_tag LIKE 'nuxx-mesh-member-status:%'
            OR NEW.d_tag LIKE 'buzz-mesh-member-status:%')
       AND (NEW.tags @> '[["k", "nuxx-mesh-status"]]'::jsonb
            OR NEW.tags @> '[["k", "buzz-mesh-status"]]'::jsonb) THEN
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
