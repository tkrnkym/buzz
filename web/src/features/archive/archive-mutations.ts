import type { ArchiveSubscription, Showcase } from "@/mock/showcase";

/**
 * Fixture edits for the archive panels.
 *
 * These three controls existed and did nothing but raise a toast — the
 * subscription stayed in the list, the archived member stayed archived, and the
 * kind checkboxes had no button to act on them. A control that reports success
 * and changes nothing is worse than one that is visibly disabled: the reader has
 * no way to tell it apart from a control that worked.
 */

/** Stop keeping a local copy of something. */
export function removeArchiveSubscription(
  current: Showcase,
  id: string,
): Showcase {
  return {
    ...current,
    archiveSubscriptions: current.archiveSubscriptions.filter(
      (row) => row.id !== id,
    ),
  };
}

/**
 * Start keeping one.
 *
 * `events: 0` because nothing has been fetched yet, and `lastSyncedAt` is the
 * moment it was created rather than 0 — a brand-new subscription that reported
 * "synced 55 years ago" would read as broken.
 */
export function addArchiveSubscription(
  current: Showcase,
  subscription: { id: string; scope: string; kinds: number[]; at: number },
): Showcase {
  const row: ArchiveSubscription = {
    id: subscription.id,
    scope: subscription.scope,
    kinds: subscription.kinds,
    events: 0,
    lastSyncedAt: subscription.at,
  };
  return {
    ...current,
    archiveSubscriptions: [...current.archiveSubscriptions, row],
  };
}

/**
 * Put an archived member back.
 *
 * Two lists change, because an archive is a move rather than a flag: the row
 * leaves `archivedIdentities` *and* rejoins `members`. Doing only the first would
 * leave the person neither archived nor a member — invisible everywhere, which is
 * a worse outcome than the archive they were in.
 *
 * They return as a plain member. Whatever they were before is not recorded, and
 * silently restoring someone to owner or admin is the one guess here with a
 * consequence attached.
 */
export function restoreArchivedIdentity(
  current: Showcase,
  pubkey: string,
): Showcase {
  const archived = current.archivedIdentities.find(
    (row) => row.pubkey === pubkey,
  );
  if (!archived) return current;
  const alreadyMember = current.members.some((row) => row.pubkey === pubkey);
  return {
    ...current,
    archivedIdentities: current.archivedIdentities.filter(
      (row) => row.pubkey !== pubkey,
    ),
    members: alreadyMember
      ? current.members
      : [
          ...current.members,
          {
            pubkey,
            role: "member",
            joinedAt: archived.joinedAt,
            timeoutUntil: null,
          },
        ],
  };
}
