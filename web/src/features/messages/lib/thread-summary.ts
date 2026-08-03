/**
 * Thread summaries: the "N replies" row under a thread root.
 *
 * The channel timeline shows only top-level messages; replies live in the
 * thread panel. That is the desktop client's model, and it is why a busy thread
 * cannot bury the rest of a channel. The summary is what connects the two, so it
 * has to describe the *whole* thread — every descendant, not just direct
 * children — or the count in the timeline disagrees with what the panel shows.
 */

import type { TimelineRow } from "@/features/chat/timeline";

export interface ThreadSummary {
  rootId: string;
  replyCount: number;
  /** Newest reply time, for "last reply 3 hours ago". */
  lastReplyAt: number;
  /** Distinct reply authors, oldest reply first, for the avatar stack. */
  participantPubkeys: string[];
}

/**
 * Build one summary per thread root, keyed by root id.
 *
 * A reply's thread is taken from `rootId` when it has one and from `parentId`
 * otherwise: a direct reply carries a single marked `e` tag that is both root
 * and parent (see `chat-model.parseThreadRefs`), so relying on `rootId` alone
 * would lose every one-level thread.
 */
export function buildThreadSummaries(
  rows: TimelineRow[],
): Map<string, ThreadSummary> {
  const summaries = new Map<string, ThreadSummary>();
  const seenParticipants = new Map<string, Set<string>>();

  // Chronological, so the participant order matches the order they spoke.
  const replies = rows
    .filter(
      (row) => row.message.parentId !== null || row.message.rootId !== null,
    )
    .sort((left, right) => left.message.createdAt - right.message.createdAt);

  for (const row of replies) {
    const rootId = row.message.rootId ?? row.message.parentId;
    if (!rootId) continue;
    // A deleted reply still counts: the thread happened, and hiding it would
    // make the panel's contents contradict the timeline's count.
    const existing = summaries.get(rootId);
    const participants = seenParticipants.get(rootId) ?? new Set<string>();
    seenParticipants.set(rootId, participants);

    if (!existing) {
      participants.add(row.message.pubkey);
      summaries.set(rootId, {
        rootId,
        replyCount: 1,
        lastReplyAt: row.message.createdAt,
        participantPubkeys: [row.message.pubkey],
      });
      continue;
    }

    existing.replyCount += 1;
    existing.lastReplyAt = Math.max(
      existing.lastReplyAt,
      row.message.createdAt,
    );
    if (!participants.has(row.message.pubkey)) {
      participants.add(row.message.pubkey);
      existing.participantPubkeys.push(row.message.pubkey);
    }
  }

  return summaries;
}

/**
 * Every row belonging to one thread, oldest first: the root followed by its
 * descendants.
 *
 * Returns an empty array when the root itself is not loaded — the panel would
 * otherwise render replies under nothing, which reads as a channel rather than
 * a thread.
 */
export function threadRows(rows: TimelineRow[], rootId: string): TimelineRow[] {
  const root = rows.find((row) => row.message.id === rootId);
  if (!root) return [];

  const replies = rows.filter((row) => {
    if (row.message.id === rootId) return false;
    return (row.message.rootId ?? row.message.parentId) === rootId;
  });

  return [root, ...replies].sort(
    (left, right) =>
      left.message.createdAt - right.message.createdAt ||
      left.message.id.localeCompare(right.message.id),
  );
}
