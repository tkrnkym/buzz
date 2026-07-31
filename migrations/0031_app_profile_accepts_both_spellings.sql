-- Widen `push_gateway_installations.app_profile`'s CHECK to accept the renamed
-- profile values alongside the originals.
--
-- The gateway now writes `nuxx-ios-production` / `nuxx-ios-sandbox`
-- (AppProfile::as_str in crates/nuxx-push-gateway/src/model.rs). Migration 0015
-- created this table with a CHECK that admits only the `buzz-ios-*` spellings,
-- and 0015 is applied, so its text cannot change — sqlx compares each applied
-- migration's checksum and refuses to boot on a mismatch. Without this widening
-- the first installation the renamed gateway registers is rejected by the CHECK,
-- and the failure surfaces as a constraint violation on a write path rather than
-- as anything resembling a rename problem.
--
-- Both spellings are admitted rather than replaced. The column holds stored data:
-- rows registered before the rename carry `buzz-ios-*`, and a CHECK that
-- excluded them would make every one of those rows invalid — subsequent UPDATEs
-- against them would fail even though nothing about the row changed. New rows
-- only ever carry the `nuxx-` spelling, so the old values drain as installations
-- re-register.
--
-- The gateway's own schema (crates/nuxx-push-gateway/migrations/0001) already
-- declares the new spelling directly; it targets a dedicated database that has
-- not been provisioned from this fork, so it had no applied checksum to preserve.
-- This migration covers the relay-side copy of the table, which a co-located
-- deployment uses.

ALTER TABLE push_gateway_installations
    DROP CONSTRAINT IF EXISTS push_gateway_installations_app_profile_check;

ALTER TABLE push_gateway_installations
    ADD CONSTRAINT push_gateway_installations_app_profile_check
    CHECK (app_profile IN (
        'nuxx-ios-production', 'nuxx-ios-sandbox',
        'buzz-ios-production', 'buzz-ios-sandbox'
    ));
