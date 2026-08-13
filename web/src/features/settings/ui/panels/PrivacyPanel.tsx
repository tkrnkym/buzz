import { CircleSlash, FileWarning, WifiOff } from "lucide-react";
import { useState } from "react";

import {
  REVOCATION_LABELS,
  STALENESS_IS_PROVISIONAL,
  STALENESS_RULES,
  blocksExecution,
  requiresLiveRegistry,
  type RevocationState,
} from "@/features/security/revocation";
import {
  defaultState,
  isConfigurable,
  NEVER_COLLECTED,
  TELEMETRY_CATEGORIES,
  type Edition,
} from "@/features/security/telemetry";
import {
  SettingCard,
  SettingGroupHeading,
  SettingRow,
} from "@/features/settings/ui/SettingRow";
import { Switch } from "@/shared/ui/switch";

/**
 * What leaves this deployment, and what happens to what has already left.
 *
 * One screen for two subjects because they are the same question asked in both
 * directions: telemetry is what this instance sends out about itself, and
 * revocation is what it does when something it fetched is withdrawn.
 *
 * The edition matters and is not hidden. On a self-hosted deployment every
 * category is optional and off, because nobody asked a vendor to watch their
 * server; on the hosted service the operational minimum is required and is
 * shown as required rather than as a switch that does nothing.
 *
 * The staleness table is labelled provisional, because the design document
 * records that question as open. Showing it as settled is how a placeholder
 * quietly becomes the answer.
 */
export function PrivacyPanel() {
  // This client cannot know how it was deployed, so the reader says. Stated
  // rather than guessed: the defaults differ, and guessing wrong means showing
  // someone the wrong promise about their own data.
  const [edition, setEdition] = useState<Edition>("saas");
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});

  return (
    <div className="flex flex-col gap-6">
      <SettingCard>
        <SettingRow
          description="配備の形によって、何が必須かが変わります。この画面からは判別できないので選んでください。"
          testId="edition-row"
          title="この配備"
        >
          <span className="flex gap-1.5">
            {(
              [
                ["saas", "SaaS"],
                ["self-hosted-enterprise", "自己ホスト"],
                ["community", "CE"],
              ] as const
            ).map(([id, label]) => (
              <button
                aria-pressed={edition === id}
                className={
                  edition === id
                    ? "rounded-md border border-primary bg-primary/10 px-2.5 py-1.5 text-2xs font-medium"
                    : "rounded-md border border-border px-2.5 py-1.5 text-2xs font-medium hover:bg-accent"
                }
                data-testid={`edition-${id}`}
                key={id}
                onClick={() => setEdition(id)}
                type="button"
              >
                {label}
              </button>
            ))}
          </span>
        </SettingRow>
      </SettingCard>

      <SettingGroupHeading>送信するもの</SettingGroupHeading>

      <SettingCard testId="telemetry-categories">
        {TELEMETRY_CATEGORIES.map((category) => {
          const state = defaultState(edition, category.id);
          const configurable = isConfigurable(state);
          const key = `${edition}:${category.id}`;
          return (
            <SettingRow
              description={category.description}
              key={category.id}
              testId={`telemetry-${category.id}`}
              title={category.label}
            >
              {configurable ? (
                <Switch
                  checked={enabled[key] ?? state === "optional-on"}
                  data-testid={`telemetry-toggle-${category.id}`}
                  onCheckedChange={(next) =>
                    setEnabled((current) => ({ ...current, [key]: next }))
                  }
                />
              ) : (
                // Shown as required rather than as a switch that silently does
                // nothing — a disabled toggle invites someone to hunt for the
                // permission to flip it.
                <span
                  className="rounded bg-muted px-2 py-0.5 text-badge font-medium text-muted-foreground"
                  data-testid={`telemetry-required-${category.id}`}
                >
                  必須
                </span>
              )}
            </SettingRow>
          );
        })}
      </SettingCard>

      <SettingCard>
        <div className="px-4 py-3.5">
          <p className="flex items-center gap-1.5 text-2xs font-medium">
            <CircleSlash aria-hidden className="size-3.5" />
            どの設定でも送らないもの
          </p>
          <ul
            className="mt-1.5 flex flex-wrap gap-1.5"
            data-testid="never-collected"
          >
            {NEVER_COLLECTED.map((item) => (
              <li
                className="rounded bg-muted px-1.5 py-0.5 text-badge"
                key={item}
              >
                {item}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-badge text-muted-foreground">
            {/* Why this is a guarantee and not a promise. */}
            計測イベントは数値と短い区分だけを持つ形になっていて、自由入力の欄がありません。あとから本文を入れようとしても、入れる場所がありません。
          </p>
        </div>
      </SettingCard>

      <SettingGroupHeading>取り下げられたもの</SettingGroupHeading>

      <SettingCard testId="revocation-states">
        {(
          ["active", "superseded", "deprecated", "revoked"] as RevocationState[]
        ).map((state) => (
          <SettingRow
            description={
              blocksExecution(state)
                ? "検索・キャッシュ・実行の対象から外れます。"
                : "使えます。これは今後についてのお知らせです。"
            }
            key={state}
            testId={`revocation-${state}`}
            title={REVOCATION_LABELS[state]}
          />
        ))}
      </SettingCard>

      <SettingCard>
        <p className="flex items-start gap-2 px-4 py-3.5 text-2xs text-muted-foreground">
          <WifiOff aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          <span>
            {requiresLiveRegistry()
              ? ""
              : "Registry への常時接続は要りません。署名された Advisory を定期的に取得して、手元で検証します。完全に切り離された環境では、署名付きの Bundle を手で取り込めます。"}
            <br />
            取り下げの対象は、公開元が自分で出した版だけです。誰かが分岐させて持っているものが勝手に消えることはありません。
          </span>
        </p>
      </SettingCard>

      <div>
        <SettingGroupHeading>失効情報が古くなったとき</SettingGroupHeading>
        {STALENESS_IS_PROVISIONAL && (
          <p
            className="mt-0.5 flex items-start gap-1.5 text-2xs text-warning"
            data-testid="staleness-provisional"
          >
            <FileWarning aria-hidden className="mt-0.5 size-3 shrink-0" />
            {/* Marked, because the doc records this as undecided. An open
                question shown as settled becomes settled by default. */}
            この期限はまだ決まっていません。下は暫定案です。
          </p>
        )}
      </div>

      <SettingCard testId="staleness-rules">
        {STALENESS_RULES.map((rule) => (
          <SettingRow
            description={rule.onStaleLabel}
            key={rule.edition}
            testId={`staleness-${rule.edition}`}
            title={`${rule.label} — ${
              rule.maxAgeSeconds >= 24 * 3_600
                ? `${rule.maxAgeSeconds / (24 * 3_600)}日`
                : `${rule.maxAgeSeconds / 3_600}時間`
            }`}
          />
        ))}
      </SettingCard>
    </div>
  );
}
