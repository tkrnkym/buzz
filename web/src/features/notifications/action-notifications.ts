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
export function buildActionNotifications(
  workflows: ShowcaseWorkflow[],
): NotificationItem[] {
  return workflows
    .filter((workflow) => workflow.pendingApprovals > 0)
    .map((workflow) => ({
      id: `action-${workflow.id}`,
      category: "action",
      authorPubkey: `showcase-workflow:${workflow.id}`,
      authorLabel: workflow.name,
      channelId: null,
      createdAt: workflow.lastRun?.startedAt ?? 0,
      content:
        workflow.pendingApprovals === 1
          ? `#${workflow.channel} で1件の承認待ち`
          : `#${workflow.channel} で${workflow.pendingApprovals}件の承認待ち`,
    }));
}
