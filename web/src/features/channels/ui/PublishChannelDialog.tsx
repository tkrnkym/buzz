import { AlertTriangle, Check, Globe, ShieldAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import {
  buildAuditEntry,
  canPublish,
  findingsSummary,
  type PublishStep,
} from "@/features/channels/publish-flow";
import {
  publishDecision,
  scanForSecrets,
  type ScanTarget,
} from "@/features/channels/secret-scan";
import { cn } from "@/shared/lib/cn";
import { Dialog } from "@/shared/ui/dialog";

const STEP_TITLES: Record<Exclude<PublishStep, "done">, string> = {
  preview: "公開される範囲",
  findings: "秘密情報の検査",
  confirm: "最終確認",
};

/**
 * Turning a private channel public.
 *
 * Three screens in one dialog, in the order the spec fixes: what will become
 * visible, what the scan found, and the confirmation. The reason the scope comes
 * first is that this operation is not "make new messages public" — the whole
 * history goes with it, and that is the part people do not expect.
 *
 * There is no second approver and no waiting period, so this dialog is the only
 * thing between a private history and a public one. Which is why a blocking
 * finding has no override here: `canPublish` refuses it, and there is
 * deliberately no control that asks again.
 */
export function PublishChannelDialog({
  channelId,
  channelName,
  messageCount,
  onClose,
  onPublished,
  scanTargets,
  selfPubkey,
}: {
  channelId: string;
  channelName: string;
  /** How much history goes public — the number people underestimate. */
  messageCount: number;
  onClose: () => void;
  onPublished: () => void;
  scanTargets: ScanTarget[];
  selfPubkey: string | null;
}) {
  const [step, setStep] = useState<PublishStep>("preview");
  const [acknowledged, setAcknowledged] = useState(false);
  const [reauthenticated, setReauthenticated] = useState(false);

  // Scanned once for the dialog's lifetime: re-running it per render would let
  // the verdict change under the reader between reading it and acting on it.
  const findings = useMemo(() => scanForSecrets(scanTargets), [scanTargets]);
  const decision = useMemo(() => publishDecision(findings), [findings]);

  const state = { step, decision, acknowledged, reauthenticated };
  const blocked = decision === "blocked";

  const publish = () => {
    if (!canPublish({ ...state, step: "confirm" })) return;
    const entry = buildAuditEntry({
      actorPubkey: selfPubkey ?? "",
      at: Math.floor(Date.now() / 1000),
      channelId,
      channelName,
      findings,
    });
    // The audit record and the notice to participants are both part of the
    // operation rather than follow-ups: a publication nobody was told about is
    // the failure mode this flow exists to avoid.
    console.info("[audit] channel published", entry);
    onPublished();
    toast.success(`#${channelName} を公開しました。参加者に通知しました。`);
    onClose();
  };

  return (
    <Dialog
      description={
        step === "preview"
          ? "このチャンネルを誰でも読める状態にします。過去の投稿もすべて対象です。"
          : STEP_TITLES[step as Exclude<PublishStep, "done">]
      }
      footer={
        <>
          <button
            className="rounded-md px-3 py-1.5 text-2xs font-medium text-muted-foreground hover:text-foreground"
            data-testid="publish-cancel"
            onClick={onClose}
            type="button"
          >
            やめる
          </button>
          {step === "preview" && (
            <button
              className="rounded-md bg-primary px-3 py-1.5 text-2xs font-medium text-primary-foreground"
              data-testid="publish-to-findings"
              onClick={() => setStep("findings")}
              type="button"
            >
              検査に進む
            </button>
          )}
          {step === "findings" && (
            <button
              className="rounded-md bg-primary px-3 py-1.5 text-2xs font-medium text-primary-foreground disabled:opacity-60"
              data-testid="publish-to-confirm"
              // Blocked has no override, by design. Warnings need the checkbox.
              disabled={blocked || (decision !== "clear" && !acknowledged)}
              onClick={() => setStep("confirm")}
              type="button"
            >
              確認に進む
            </button>
          )}
          {step === "confirm" && (
            <button
              className="rounded-md bg-primary px-3 py-1.5 text-2xs font-medium text-primary-foreground disabled:opacity-60"
              data-testid="publish-confirm"
              disabled={!canPublish({ ...state, step: "confirm" })}
              onClick={publish}
              type="button"
            >
              公開する
            </button>
          )}
        </>
      }
      onClose={onClose}
      open
      testId="publish-channel-dialog"
      title={`#${channelName} を公開する`}
    >
      <div className="flex flex-col gap-3">
        {step === "preview" && (
          <div className="flex flex-col gap-2" data-testid="publish-preview">
            <p className="flex items-start gap-2 rounded-md border border-border px-2.5 py-2 text-2xs">
              <Globe aria-hidden className="mt-0.5 size-3.5 shrink-0" />
              <span>
                <span className="font-medium">
                  過去の投稿 {messageCount} 件も公開されます。
                </span>
                <br />
                いま参加していない人も、これまでのやり取りをすべて読めるようになります。
              </span>
            </p>
            <p className="text-badge text-muted-foreground">
              取り消しても、公開されていた間に読まれた内容は戻せません。
            </p>
          </div>
        )}

        {step === "findings" && (
          <div className="flex flex-col gap-2" data-testid="publish-findings">
            <p
              className={cn(
                "flex items-start gap-2 rounded-md px-2.5 py-2 text-2xs",
                blocked
                  ? "bg-destructive/10 text-destructive"
                  : decision === "needs-confirmation"
                    ? "bg-warning-bg text-warning"
                    : "border border-border",
              )}
              data-testid="publish-findings-summary"
            >
              {blocked ? (
                <ShieldAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
              ) : decision === "needs-confirmation" ? (
                <AlertTriangle
                  aria-hidden
                  className="mt-0.5 size-3.5 shrink-0"
                />
              ) : (
                <Check aria-hidden className="mt-0.5 size-3.5 shrink-0" />
              )}
              {findingsSummary(decision, findings)}
            </p>

            {findings.length > 0 && (
              <ul
                className="flex flex-col gap-1"
                data-testid="publish-finding-list"
              >
                {findings.map((finding) => (
                  <li
                    className="flex flex-wrap items-baseline gap-x-2 rounded-md border border-border px-2.5 py-1.5 text-badge"
                    data-testid={`finding-${finding.id}`}
                    key={finding.id}
                  >
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 font-medium",
                        finding.severity === "blocking"
                          ? "bg-destructive/10 text-destructive"
                          : "bg-warning-bg text-warning",
                      )}
                    >
                      {finding.severity === "blocking" ? "停止" : "要確認"}
                    </span>
                    <span className="font-medium">{finding.kind}</span>
                    {/* Redacted at the model — never the value itself. */}
                    <span className="font-mono text-muted-foreground">
                      {finding.excerpt}
                    </span>
                    <span className="text-muted-foreground">
                      {finding.where}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {decision === "needs-confirmation" && (
              <label className="flex items-start gap-2 text-2xs">
                <input
                  checked={acknowledged}
                  className="mt-0.5 size-3.5 shrink-0"
                  data-testid="publish-acknowledge"
                  onChange={(event) => setAcknowledged(event.target.checked)}
                  type="checkbox"
                />
                上の記載を確認し、公開してよいと判断しました。
              </label>
            )}

            <p className="text-badge text-muted-foreground">
              検査はこの端末の中だけで行われます。内容を外部に送信していません。
            </p>
          </div>
        )}

        {step === "confirm" && (
          <div
            className="flex flex-col gap-2"
            data-testid="publish-confirm-step"
          >
            <p className="text-2xs">
              #{channelName} と過去の投稿 {messageCount}{" "}
              件を、いますぐ公開します。承認待ちや待機期間はありません。
            </p>
            <label className="flex items-start gap-2 text-2xs">
              <input
                checked={reauthenticated}
                className="mt-0.5 size-3.5 shrink-0"
                data-testid="publish-reauth"
                onChange={(event) => setReauthenticated(event.target.checked)}
                type="checkbox"
              />
              {/* A real re-authentication is a signer prompt; this client has no
                  durable key to challenge, so the step is present and honest
                  about what it is rather than faked as a password box. */}
              本人であることを確認しました（この画面ではチェックで代用しています）。
            </label>
            <p className="text-badge text-muted-foreground">
              実行すると監査記録に残り、参加者に通知されます。
            </p>
          </div>
        )}
      </div>
    </Dialog>
  );
}
