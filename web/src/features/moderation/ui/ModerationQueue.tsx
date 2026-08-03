import { ShieldAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { useCanModerate } from "@/features/directory/use-directory";
import {
  auditActionLabel,
  isTimedOut,
  reportTypeLabel,
  TIMEOUT_PRESETS,
  timeoutExpiresAt,
  type ResolutionAction,
} from "@/features/moderation/moderation-model";
import {
  useModerationAudit,
  useModerationReports,
  useResolveReport,
  useRestrictions,
  useTimeoutMember,
  useUnbanMember,
  useUntimeoutMember,
} from "@/features/moderation/use-moderation";
import { resolveUserLabel } from "@/features/profile/profile-model";
import { useProfiles } from "@/features/profile/profile-store";
import { cn } from "@/shared/lib/cn";

type Tab = "queue" | "restricted" | "audit";

const TABS: ReadonlyArray<{ value: Tab; label: string }> = [
  { value: "queue", label: "未処理の通報" },
  { value: "restricted", label: "制限中のメンバー" },
  { value: "audit", label: "操作ログ" },
];

/**
 * Dispositions offered on a queued report.
 *
 * `delete` and `kick` are absent on purpose: both need a target the queue row
 * does not carry on its own (a channel for a kick, an event still present for a
 * delete), and offering an action that resolves the report without doing the
 * thing it names would be worse than not offering it.
 */
const RESOLUTIONS: ReadonlyArray<{
  action: ResolutionAction;
  label: string;
  destructive?: boolean;
}> = [
  { action: "dismiss", label: "却下" },
  { action: "escalate", label: "エスカレート" },
  { action: "ban", label: "BAN", destructive: true },
];

function formatWhen(value: string): string {
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return value;
  return new Date(ms).toLocaleString("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * The moderator surface: what has been reported, who is restricted, and what
 * moderators have done.
 *
 * Moderator-only, and it says so rather than rendering an empty panel — a member
 * who lands here should learn why there is nothing, not conclude the community
 * has never had a report. The gate mirrors the relay's, which is the one that
 * counts: `/moderation/*` answers 403 for anyone else.
 */
export function ModerationQueue() {
  const canModerate = useCanModerate();
  const [tab, setTab] = useState<Tab>("queue");

  const reports = useModerationReports({ status: "open", limit: 50 });
  const restrictions = useRestrictions();
  const audit = useModerationAudit(50);
  const resolve = useResolveReport();
  const untimeout = useUntimeoutMember();
  const unban = useUnbanMember();
  const timeout = useTimeoutMember();

  const people = [
    ...(reports.data ?? []).map((report) => report.reporterPubkey),
    ...(restrictions.data ?? []).map((row) => row.pubkey),
    ...(audit.data ?? []).flatMap((row) =>
      [row.actorPubkey, row.targetPubkey].filter(
        (value): value is string => value !== null,
      ),
    ),
  ];
  const profiles = useProfiles(people);
  const nameOf = (pubkey: string) =>
    resolveUserLabel({ pubkey, profiles, preferResolvedSelfLabel: true });

  if (!canModerate) {
    return (
      <p
        className="text-2xs text-muted-foreground"
        data-testid="moderation-gated"
      >
        通報とモデレーション履歴は、オーナーと管理者だけが読めます。
      </p>
    );
  }

  const run = (action: Promise<unknown>, success: string) => {
    action
      .then(() => toast.success(success))
      .catch((error: unknown) =>
        toast.error(
          error instanceof Error ? error.message : "操作できませんでした",
        ),
      );
  };

  const activeQuery =
    tab === "queue" ? reports : tab === "restricted" ? restrictions : audit;

  return (
    <div className="flex flex-col gap-3" data-testid="moderation-queue">
      <div className="flex gap-1" role="tablist">
        {TABS.map((option) => (
          <button
            aria-selected={tab === option.value}
            className={cn(
              "rounded-md px-2.5 py-1.5 text-2xs font-medium transition-colors",
              tab === option.value
                ? "bg-secondary text-secondary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
            data-testid={`moderation-tab-${option.value}`}
            key={option.value}
            onClick={() => setTab(option.value)}
            role="tab"
            type="button"
          >
            {option.label}
            {option.value === "queue" && (reports.data?.length ?? 0) > 0 && (
              <span className="ml-1.5 rounded bg-destructive px-1 text-badge text-destructive-foreground">
                {reports.data?.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {activeQuery.isPending && (
        <p className="text-2xs text-muted-foreground">読み込み中…</p>
      )}
      {activeQuery.error && (
        <p className="text-2xs text-destructive">
          {activeQuery.error instanceof Error
            ? activeQuery.error.message
            : "読み込めませんでした"}
        </p>
      )}

      {tab === "queue" && !activeQuery.isPending && (
        <ul className="flex flex-col gap-2">
          {(reports.data ?? []).length === 0 && (
            <li className="flex items-center gap-2 text-2xs text-muted-foreground">
              <ShieldAlert aria-hidden className="size-3.5" />
              未処理の通報はありません。
            </li>
          )}
          {(reports.data ?? []).map((report) => (
            <li
              className="rounded-lg border border-border px-3 py-2.5"
              data-testid={`moderation-report-${report.id}`}
              key={report.id}
            >
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="rounded bg-secondary px-1.5 py-0.5 text-badge font-medium text-secondary-foreground">
                  {reportTypeLabel(report.reportType)}
                </span>
                <span className="text-2xs">
                  {nameOf(report.reporterPubkey)} が通報
                </span>
                <span className="text-badge text-muted-foreground">
                  {formatWhen(report.createdAt)}
                </span>
              </div>
              {report.note && (
                <p className="mt-1.5 whitespace-pre-wrap text-2xs text-muted-foreground">
                  {report.note}
                </p>
              )}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {RESOLUTIONS.map((option) => (
                  <button
                    className={cn(
                      "rounded-md border px-2 py-1 text-badge font-medium transition-colors disabled:opacity-60",
                      option.destructive
                        ? "border-destructive/40 text-destructive hover:bg-destructive/10"
                        : "border-border hover:bg-accent",
                    )}
                    data-testid={`resolve-${option.action}-${report.id}`}
                    disabled={resolve.isPending}
                    key={option.action}
                    onClick={() =>
                      run(
                        resolve.mutateAsync({
                          reportEventId: report.reportEventId,
                          action: option.action,
                        }),
                        "通報を処理しました",
                      )
                    }
                    type="button"
                  >
                    {option.label}
                  </button>
                ))}
                {report.targetKind === "pubkey" &&
                  TIMEOUT_PRESETS.map((preset) => (
                    <button
                      className="rounded-md border border-border px-2 py-1 text-badge transition-colors hover:bg-accent disabled:opacity-60"
                      data-testid={`resolve-timeout-${preset.seconds}-${report.id}`}
                      disabled={timeout.isPending}
                      key={preset.seconds}
                      onClick={() =>
                        run(
                          timeout
                            .mutateAsync({
                              pubkey: report.target,
                              expiresAt: timeoutExpiresAt(preset.seconds),
                            })
                            .then(() =>
                              resolve.mutateAsync({
                                reportEventId: report.reportEventId,
                                action: "timeout",
                              }),
                            ),
                          `${preset.label}のタイムアウトを適用しました`,
                        )
                      }
                      type="button"
                    >
                      {preset.label}タイムアウト
                    </button>
                  ))}
              </div>
            </li>
          ))}
        </ul>
      )}

      {tab === "restricted" && !activeQuery.isPending && (
        <ul className="flex flex-col gap-1">
          {(restrictions.data ?? []).length === 0 && (
            <li className="text-2xs text-muted-foreground">
              制限中のメンバーはいません。
            </li>
          )}
          {(restrictions.data ?? []).map((row) => {
            const timedOut = isTimedOut(row.mutedUntil);
            return (
              <li
                className="flex flex-wrap items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent/50"
                data-testid={`restricted-${row.pubkey}`}
                key={row.pubkey}
              >
                <span className="min-w-0 flex-1 truncate text-2xs">
                  {nameOf(row.pubkey)}
                </span>
                {row.banned && (
                  <span className="rounded bg-destructive px-1.5 py-0.5 text-badge text-destructive-foreground">
                    BAN
                  </span>
                )}
                {timedOut && (
                  <span className="rounded bg-secondary px-1.5 py-0.5 text-badge text-secondary-foreground">
                    タイムアウト中
                  </span>
                )}
                {row.banned && (
                  <button
                    className="rounded-md border border-border px-2 py-0.5 text-badge hover:bg-accent disabled:opacity-60"
                    data-testid={`unban-${row.pubkey}`}
                    disabled={unban.isPending}
                    onClick={() =>
                      run(unban.mutateAsync(row.pubkey), "BANを解除しました")
                    }
                    type="button"
                  >
                    BAN解除
                  </button>
                )}
                {timedOut && (
                  <button
                    className="rounded-md border border-border px-2 py-0.5 text-badge hover:bg-accent disabled:opacity-60"
                    data-testid={`untimeout-${row.pubkey}`}
                    disabled={untimeout.isPending}
                    onClick={() =>
                      run(
                        untimeout.mutateAsync(row.pubkey),
                        "タイムアウトを解除しました",
                      )
                    }
                    type="button"
                  >
                    タイムアウト解除
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {tab === "audit" && !activeQuery.isPending && (
        <ul className="flex flex-col gap-1">
          {(audit.data ?? []).length === 0 && (
            <li className="text-2xs text-muted-foreground">
              まだ操作はありません。
            </li>
          )}
          {(audit.data ?? []).map((row) => (
            <li
              className="flex flex-wrap items-baseline gap-2 px-2 py-1 text-2xs"
              key={row.id}
            >
              <span className="font-medium">
                {auditActionLabel(row.action)}
              </span>
              <span className="text-muted-foreground">
                {nameOf(row.actorPubkey)}
                {row.targetPubkey && ` → ${nameOf(row.targetPubkey)}`}
              </span>
              <span className="text-badge text-muted-foreground">
                {formatWhen(row.createdAt)}
              </span>
              {row.publicReason && (
                <span className="text-badge text-muted-foreground">
                  「{row.publicReason}」
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
