import { toast } from "sonner";

import {
  APPROVAL_STATE_LABELS,
  effectiveDeadlineSeconds,
  formatDuration,
  isTightening,
  RISK_CLASSES,
  type RiskClass,
} from "@/features/security/approval-policy";
import {
  CAPABILITIES,
  EVALUATION_ORDER,
  STAGE_LABELS,
} from "@/features/security/capability";
import {
  SettingCard,
  SettingGroupHeading,
  SettingRow,
} from "@/features/settings/ui/SettingRow";
import { NotWiredUp } from "@/features/showcase/ui/ShowcasePage";
import {
  useShowcase,
  useShowcaseUpdate,
} from "@/features/showcase/use-showcase";
import { ValuePicker } from "@/shared/ui/field-row";

const HOUR = 3_600;
const DAY = 24 * HOUR;

/** The windows worth offering. Anything longer is not a deadline. */
const DEADLINE_OPTIONS = [
  { value: String(HOUR), label: "1時間" },
  { value: String(4 * HOUR), label: "4時間" },
  { value: String(DAY), label: "24時間" },
  { value: String(3 * DAY), label: "3日" },
  { value: String(7 * DAY), label: "7日" },
];

/**
 * Approval policies, and the capability vocabulary they are written in.
 *
 * The deadlines are the settable part. The evaluation order below them is not —
 * it is shown because a permission that was refused is unfixable if nobody can
 * see what decides, and because the order is a property of the system rather
 * than a preference of this workspace.
 *
 * Every write here bumps the policy version, and a run pins the version it
 * started under. That is what stops an edit made halfway through a long
 * approval from changing the rules the pending request is judged by.
 */
export function SecurityPanel() {
  const showcase = useShowcase();
  const update = useShowcaseUpdate();

  if (!showcase) return <NotWiredUp what="承認ポリシー" />;

  const deadlines = showcase.approvalDeadlines;

  const setDeadline = (risk: RiskClass, seconds: number) => {
    update?.((current) => ({
      ...current,
      approvalDeadlines: { ...current.approvalDeadlines, [risk]: seconds },
      // Bumped on every edit, so a pending run's pinned version stops matching
      // and it is judged by what it started under.
      approvalPolicyVersion: current.approvalPolicyVersion + 1,
    }));
    toast.success("承認ポリシーを更新しました");
  };

  return (
    <div className="flex flex-col gap-6">
      <SettingCard>
        <SettingRow
          description="この Workspace のポリシー。編集するたびに版が上がり、実行中の依頼は開始時の版で判定され続けます。"
          testId="policy-version-row"
          title="ポリシーの版"
        >
          <code
            className="rounded-md bg-muted px-2 py-1 font-mono text-2xs"
            data-testid="policy-version"
          >
            v{showcase.approvalPolicyVersion}
          </code>
        </SettingRow>
      </SettingCard>

      <div>
        <SettingGroupHeading>承認の期限</SettingGroupHeading>
        <p className="mt-0.5 text-2xs text-muted-foreground">
          {/* Why the risky ones are shorter, stated once rather than per row. */}
          返事がないまま期限を過ぎた依頼は
          {APPROVAL_STATE_LABELS.expired}
          として終わります。危険な操作ほど短いのは、時間が経つと依頼された文脈が失われ、あとから承認しても誰も再確認していないものを通すことになるからです。
        </p>
      </div>

      <SettingCard testId="approval-deadlines">
        {RISK_CLASSES.map((risk) => (
          <SettingRow
            description={risk.description}
            key={risk.id}
            testId={`deadline-row-${risk.id}`}
            title={risk.label}
          >
            <span className="flex items-center gap-2">
              {deadlines[risk.id] !== risk.defaultSeconds && (
                <span className="text-badge text-muted-foreground">
                  既定 {formatDuration(risk.defaultSeconds)}
                </span>
              )}
              <ValuePicker
                ariaLabel={`${risk.label} の期限`}
                onChange={(next) => setDeadline(risk.id, Number(next))}
                options={DEADLINE_OPTIONS}
                testId={`deadline-${risk.id}`}
                value={String(
                  effectiveDeadlineSeconds(
                    deadlines[risk.id] ?? risk.defaultSeconds,
                  ),
                )}
              />
            </span>
          </SettingRow>
        ))}
      </SettingCard>

      <SettingCard>
        <p className="px-4 py-3.5 text-2xs text-muted-foreground">
          {/* The tightening-only rule, where the person setting policy reads it. */}
          エージェント・ワークフロー・プラグインの側でも期限を指定できますが、ここより
          <span className="font-medium text-foreground">
            短くする方向にだけ
          </span>
          効きます。長くする指定は無視され、この画面の値が使われます。
          {(() => {
            const widened = RISK_CLASSES.filter(
              (risk) =>
                !isTightening(
                  risk.defaultSeconds,
                  deadlines[risk.id] ?? risk.defaultSeconds,
                ),
            );
            return widened.length > 0
              ? `（${widened.map((risk) => risk.label).join("、")} は既定より長く設定されています）`
              : "";
          })()}
        </p>
      </SettingCard>

      <div>
        <SettingGroupHeading>権限の決まり方</SettingGroupHeading>
        <p className="mt-0.5 text-2xs text-muted-foreground">
          上から順に見て、最初に決まったところで確定します。どれにも当てはまらなければ拒否です。
        </p>
      </div>

      <SettingCard testId="evaluation-order">
        {EVALUATION_ORDER.map((stage, index) => (
          <div
            className="flex items-baseline gap-3 px-4 py-2.5"
            data-testid={`stage-${stage}`}
            key={stage}
          >
            <span className="w-4 shrink-0 text-badge text-muted-foreground">
              {index + 1}
            </span>
            <span className="text-2xs">{STAGE_LABELS[stage]}</span>
          </div>
        ))}
      </SettingCard>

      <div>
        <SettingGroupHeading>Capability</SettingGroupHeading>
        <p className="mt-0.5 text-2xs text-muted-foreground">
          API・UI・リレー・ランタイムで共通の名前です。画面上でボタンを隠すのは補助で、最終判断は必ずサーバー側で行われます。
        </p>
      </div>

      <SettingCard>
        <div
          className="flex flex-wrap gap-1.5 px-4 py-3.5"
          data-testid="capability-list"
        >
          {CAPABILITIES.map((capability) => (
            <code
              className="rounded bg-muted px-1.5 py-0.5 font-mono text-badge"
              key={capability}
            >
              {capability}
            </code>
          ))}
        </div>
      </SettingCard>
    </div>
  );
}
