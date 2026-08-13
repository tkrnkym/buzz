import type { NotificationItem } from "@/features/notifications/notifications-model";
import type { ShowcaseWorkflow } from "@/mock/showcase";

/**
 * "Needs action" notifications — the desktop client's counterpart, for a
 * workflow run held on a human decision.
 *
 * There is no relay event yet for an approval request (nothing in
 * `nuxx-core/src/kind.rs` models one), so this is showcase-only: it reads the
 * same `pendingApprovals` count the Workflows screen already shows rather than
 * inventing a wire shape for something the relay cannot send.
 *
 * A workflow has no author, so `authorPubkey` here is a synthetic id — stable
 * per workflow, used only as the dedup key and the avatar's colour — and
 * `authorLabel` carries the name a reader should actually see.
 */
/**
 * When the approval started waiting.
 *
 * The newest run in `runs`, not `lastRun` — the two are separate fields and
 * `lastRun` is null on rows whose history lives only in `runs`. Reading the
 * wrong one produced a `0`, which the list rendered as "689 months ago": a
 * timestamp nobody noticed was missing because zero is a valid number.
 *
 * `null` where there is genuinely no run, so the caller can decline to state a
 * time rather than claim the epoch.
 */
function heldSince(workflow: ShowcaseWorkflow): number | null {
  const times = [
    ...workflow.runs.map((run) => run.startedAt),
    ...(workflow.lastRun ? [workflow.lastRun.startedAt] : []),
  ].filter((at) => at > 0);
  return times.length === 0 ? null : Math.max(...times);
}

export function buildActionNotifications(
  workflows: ShowcaseWorkflow[],
  /** Used only where a workflow has no run to date the wait from. */
  nowSeconds: number,
): NotificationItem[] {
  return workflows
    .filter((workflow) => workflow.pendingApprovals > 0)
    .map((workflow) => ({
      id: `action-${workflow.id}`,
      category: "action",
      authorPubkey: `showcase-workflow:${workflow.id}`,
      authorLabel: workflow.name,
      channelId: null,
      // A workflow holding an approval with no run at all is waiting as of now,
      // not since 1970. Falling back to the epoch put a five-decade-old row at
      // the bottom of a list sorted by recency.
      createdAt: heldSince(workflow) ?? nowSeconds,
      content:
        workflow.pendingApprovals === 1
          ? `#${workflow.channel} で1件の承認待ち`
          : `#${workflow.channel} で${workflow.pendingApprovals}件の承認待ち`,
    }));
}
