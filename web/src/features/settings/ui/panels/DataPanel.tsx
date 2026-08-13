import { Globe2, ShieldOff } from "lucide-react";
import { toast } from "sonner";

import {
  formatRetention,
  formatTarget,
  isValidRetentionOverride,
  RECOVERY_TARGETS,
  REGIONS,
  RETENTION,
  type RetentionEntry,
} from "@/features/security/retention";
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

const DAY = 24 * 3_600;

const RETENTION_OPTIONS = [
  { value: String(7 * DAY), label: "7日" },
  { value: String(30 * DAY), label: "30日" },
  { value: String(90 * DAY), label: "90日" },
  { value: String(180 * DAY), label: "180日" },
  { value: String(365 * DAY), label: "1年" },
  { value: String(3 * 365 * DAY), label: "3年" },
];

/**
 * Where data lives, and how long it stays.
 *
 * The region is shown rather than edited: it is chosen when the workspace is
 * created and moving it afterwards is a migration, not a setting. Presenting it
 * as a dropdown would imply otherwise.
 *
 * The retention rows split into two kinds. The workspace's own content has no
 * expiry — deleting it on a timer would be deleting the product — and those
 * rows say so instead of showing a control that does nothing. The rest are
 * clocks the workspace may set.
 *
 * The backup window is on this screen deliberately, and is not editable. It is
 * the honest answer to "is it gone": the live copy goes immediately, but an
 * immutable backup cannot have one row removed, so it ages out. Someone told
 * "deleted" who later finds it in a restore has been misled.
 */
export function DataPanel() {
  const showcase = useShowcase();
  const update = useShowcaseUpdate();

  if (!showcase) return <NotWiredUp what="データの保存設定" />;

  const region = REGIONS.find((row) => row.id === showcase.dataRegion);

  const valueFor = (entry: RetentionEntry): number | null =>
    showcase.retentionOverrides[entry.key] ?? entry.defaultSeconds;

  const setRetention = (entry: RetentionEntry, seconds: number) => {
    if (!isValidRetentionOverride(entry, seconds)) return;
    update?.((current) => ({
      ...current,
      retentionOverrides: {
        ...current.retentionOverrides,
        [entry.key]: seconds,
      },
    }));
    toast.success(`${entry.label} を ${formatRetention(seconds)} にしました`);
  };

  return (
    <div className="flex flex-col gap-6">
      <SettingCard>
        <SettingRow
          description="Workspace を作るときに選びます。あとから移すのは設定変更ではなく移行なので、この画面では変えられません。"
          testId="data-region-row"
          title="Data Region"
        >
          <span className="flex items-center gap-1.5 rounded-md bg-muted px-2.5 py-1 text-2xs font-medium">
            <Globe2 aria-hidden className="size-3" />
            {region?.label ?? showcase.dataRegion}
          </span>
        </SettingRow>
        <p className="px-4 pb-3.5 text-badge text-muted-foreground">
          通常はこの Region の中で復旧します。別の Region
          へ移して復旧するのは、Workspace が事前に許可した場合だけです。
        </p>
      </SettingCard>

      <div>
        <SettingGroupHeading>保持期間</SettingGroupHeading>
        <p className="mt-0.5 text-2xs text-muted-foreground">
          期限のあるものと、ないもの。投稿や成果物はこの Workspace
          そのものなので、時間で消えることはありません。
        </p>
      </div>

      <SettingCard testId="retention-table">
        {RETENTION.map((entry) => {
          const current = valueFor(entry);
          const overridden =
            entry.configurable && current !== entry.defaultSeconds;
          return (
            <SettingRow
              description={entry.description}
              key={entry.key}
              testId={`retention-${entry.key}`}
              title={entry.label}
            >
              {entry.configurable ? (
                <span className="flex items-center gap-2">
                  {overridden && (
                    <span className="text-badge text-muted-foreground">
                      既定 {formatRetention(entry.defaultSeconds)}
                    </span>
                  )}
                  <ValuePicker
                    ariaLabel={`${entry.label} の保持期間`}
                    onChange={(next) => setRetention(entry, Number(next))}
                    options={RETENTION_OPTIONS}
                    testId={`retention-picker-${entry.key}`}
                    value={String(current)}
                  />
                </span>
              ) : (
                // No control at all, rather than a disabled one: a greyed-out
                // dropdown invites someone to go looking for the permission to
                // use it, and there is none to find.
                <span
                  className="text-2xs text-muted-foreground"
                  data-testid={`retention-fixed-${entry.key}`}
                >
                  {formatRetention(current)}
                </span>
              )}
            </SettingRow>
          );
        })}
      </SettingCard>

      <SettingCard>
        <p className="flex items-start gap-2 px-4 py-3.5 text-2xs text-muted-foreground">
          <ShieldOff aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          <span>
            稼働中の系からは期限が来た時点で消えます。変更できないバックアップは
            1 行だけ取り除けないので、最大 35
            日かけて期限切れになります。復元したときは、サービスを再開する前に削除台帳をもう一度適用します。
            <br />
            すぐに読めなくする必要があるときは、個別の暗号鍵を破棄します。バックアップに残っていても復号できません。
          </span>
        </p>
      </SettingCard>

      <div>
        <SettingGroupHeading>復旧目標</SettingGroupHeading>
        <p className="mt-0.5 text-2xs text-muted-foreground">
          RPO は「どこまで戻るか」、RTO は「いつまでに戻るか」です。
        </p>
      </div>

      <SettingCard testId="recovery-targets">
        {RECOVERY_TARGETS.map((target) => (
          <SettingRow
            description={`RPO ${formatTarget(target.rpoSeconds)} · RTO ${formatTarget(
              target.rtoSeconds,
            )}`}
            key={target.edition}
            testId={`recovery-${target.edition}`}
            title={target.label}
          >
            {target.rpoSeconds === null && (
              // Absent rather than a number nobody promised.
              <span className="text-badge text-muted-foreground">
                構成によります
              </span>
            )}
          </SettingRow>
        ))}
      </SettingCard>
    </div>
  );
}
