/**
 * Work done while disconnected, and what may happen to it afterwards.
 *
 * The rule that shapes everything here: nothing is sent automatically on
 * reconnect. A draft written offline was composed against a world that may have
 * moved — the channel may have gone public, the reader may have lost the
 * permission, the policy may have changed — and flushing a queue on reconnect
 * publishes all of it against the new world without anyone looking. So a
 * reconnect makes drafts *sendable*, and a person sends them.
 *
 * The second rule follows from the first: because sending is deferred, the
 * checks have to run at send time rather than at compose time. A draft that was
 * allowed when it was typed is not thereby allowed when it goes.
 *
 * And unsent drafts are nobody's business but their author's. They are excluded
 * from search, from the audit log, and from organisational learning — a
 * half-written message someone thought better of is not a record of anything,
 * and a system that mined it would teach people not to type.
 */

export type DraftScope = "device" | "workspace";

/** Operations too consequential to be queued against a future world. */
export type DraftRisk = "ordinary" | "high";

export interface OfflineDraft {
  id: string;
  /** Where it lives. `device` is the default and never leaves this browser. */
  scope: DraftScope;
  channelId: string;
  authorPubkey: string;
  body: string;
  updatedAt: number;
  risk: DraftRisk;
}

/**
 * Whether an operation may be composed offline at all.
 *
 * A high-risk one may not. Queuing a destructive action for later execution
 * means the person who authorised it did so without seeing the state it would
 * run against, which is the same objection as the approval deadlines in §3.
 */
export function canQueueOffline(risk: DraftRisk): boolean {
  return risk === "ordinary";
}

/**
 * Whether reconnecting is allowed to send this.
 *
 * Never. The function exists so the rule has a name and a test rather than
 * being an absence somewhere in a reconnect handler — a silently added
 * auto-flush would otherwise be indistinguishable from a bug fix.
 */
export function sendsAutomaticallyOnReconnect(): boolean {
  return false;
}

export interface SendContext {
  online: boolean;
  /** Re-checked now, not when the draft was written. */
  hasPermission: boolean;
  /** True where the channel's visibility changed since composing. */
  visibilityChanged: boolean;
  /** True where the governing policy version moved since composing. */
  policyChanged: boolean;
}

export type SendVerdict =
  | { canSend: true }
  | { canSend: false; reason: SendBlockReason };

export type SendBlockReason =
  | "offline"
  | "no-permission"
  | "visibility-changed"
  | "policy-changed";

export const SEND_BLOCK_MESSAGES: Record<SendBlockReason, string> = {
  offline: "まだ接続されていません。",
  "no-permission": "このチャンネルに書き込む権限がなくなっています。",
  "visibility-changed":
    "書いたあとにチャンネルの公開範囲が変わりました。宛先を確認してください。",
  "policy-changed":
    "書いたあとにポリシーが変わりました。もう一度確認してください。",
};

/**
 * Whether this draft may go now.
 *
 * Ordered so the most actionable reason wins: being offline is something the
 * reader can wait out, a lost permission is not, and a changed audience is the
 * one they most need to be told about before it goes rather than after.
 */
export function evaluateSend(context: SendContext): SendVerdict {
  if (!context.online) return { canSend: false, reason: "offline" };
  if (!context.hasPermission) {
    return { canSend: false, reason: "no-permission" };
  }
  if (context.visibilityChanged) {
    return { canSend: false, reason: "visibility-changed" };
  }
  if (context.policyChanged) {
    return { canSend: false, reason: "policy-changed" };
  }
  return { canSend: true };
}

/**
 * Who may read a draft.
 *
 * Its author, and nobody else — including at workspace scope. Syncing a draft
 * is about surviving a lost laptop, not about sharing: a draft becomes shared
 * by being turned into a post or a document version, which is a different
 * resource with its own visibility.
 */
export function canRead(draft: OfflineDraft, readerPubkey: string): boolean {
  return draft.authorPubkey === readerPubkey;
}

/**
 * Drafts that a search, the audit log, or organisational learning may see.
 *
 * None of them. Returned as an empty array rather than as a filter, because
 * there is no subset that qualifies — a caller that wanted "just the workspace
 * ones" would be asking the wrong question.
 */
export function indexableDrafts(_drafts: OfflineDraft[]): OfflineDraft[] {
  return [];
}

/** Promote a device-only draft to workspace scope, which is an explicit act. */
export function promoteToWorkspace(draft: OfflineDraft): OfflineDraft {
  return { ...draft, scope: "workspace" };
}

export const SCOPE_LABELS: Record<DraftScope, string> = {
  device: "この端末のみ",
  workspace: "Workspace に同期",
};
