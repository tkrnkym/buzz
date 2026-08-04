import { Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { setAgentDefaults } from "@/features/agents/agent-mutations";
import {
  useShowcase,
  useShowcaseUpdate,
} from "@/features/showcase/use-showcase";
import type { AgentDefaults } from "@/mock/showcase";
import { cn } from "@/shared/lib/cn";

const FIELD_CLASS =
  "h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

const EFFORTS: { value: AgentDefaults["effort"]; label: string }[] = [
  { value: "low", label: "低" },
  { value: "medium", label: "中" },
  { value: "high", label: "高" },
];

/**
 * Defaults every local agent inherits.
 *
 * "Inherits" is the load-bearing word, and the panel says it: an agent's own
 * setting always wins, so changing a default here is not the same as changing
 * every agent. Without that sentence this screen reads as a bulk edit.
 *
 * Secrets are masked and revealed one at a time rather than behind a single
 * show-all toggle. A screen share with every key visible is the failure this
 * avoids, and it is a common one.
 */
export function AgentDefaultsSettings() {
  const showcase = useShowcase();
  const store = useShowcaseUpdate();
  // A working copy, deliberately: this panel has a save button, so an edit is not
  // committed until it is pressed. What changed is that the commit now goes to the
  // shared fixtures instead of nowhere — before, "保存しました" left the working
  // copy as the only record and the next visit showed the old values back.
  const [draft, setDraft] = useState<AgentDefaults | null>(null);
  const [revealed, setRevealed] = useState<Set<string>>(() => new Set());
  const defaults = draft ?? showcase?.agentDefaults ?? null;

  if (!showcase || !defaults) {
    return (
      <p className="text-2xs text-muted-foreground">
        エージェントの既定値はまだリレーから読めていません。
      </p>
    );
  }

  const update = (patch: Partial<AgentDefaults>) =>
    setDraft({ ...defaults, ...patch });
  const dirty = draft !== null;

  const toggleReveal = (key: string) =>
    setRevealed((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div className="flex flex-col gap-4" data-testid="agent-defaults">
      <p className="text-2xs text-muted-foreground">
        エージェントごとの設定が常に優先されます。ここを変えても、個別に指定してあるエージェントは変わりません。
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-2xs font-medium text-muted-foreground">
            プロバイダ
          </span>
          <input
            className={FIELD_CLASS}
            data-testid="defaults-provider"
            onChange={(event) => update({ provider: event.target.value })}
            value={defaults.provider}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-2xs font-medium text-muted-foreground">
            モデル
          </span>
          <input
            className={FIELD_CLASS}
            data-testid="defaults-model"
            onChange={(event) => update({ model: event.target.value })}
            value={defaults.model}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-2xs font-medium text-muted-foreground">
            ハーネス
          </span>
          <select
            className={FIELD_CLASS}
            data-testid="defaults-harness"
            onChange={(event) => update({ harnessId: event.target.value })}
            value={defaults.harnessId}
          >
            {showcase.harnesses.map((harness) => (
              <option key={harness.id} value={harness.id}>
                {harness.name}
                {harness.available ? "" : "（未インストール）"}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-col gap-1">
          <span className="text-2xs font-medium text-muted-foreground">
            考える深さ
          </span>
          <div className="flex gap-1" data-testid="defaults-effort">
            {EFFORTS.map((option) => (
              <button
                aria-pressed={defaults.effort === option.value}
                className={cn(
                  "h-9 flex-1 rounded-md border text-2xs font-medium transition-colors",
                  defaults.effort === option.value
                    ? "border-primary bg-primary/10"
                    : "border-border hover:bg-accent",
                )}
                data-testid={`defaults-effort-${option.value}`}
                key={option.value}
                onClick={() => update({ effort: option.value })}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <p className="text-2xs font-medium text-muted-foreground">環境変数</p>
        <ul className="flex flex-col gap-1.5">
          {defaults.env.map((entry, index) => (
            <li className="flex items-center gap-2" key={entry.key}>
              <code className="w-48 shrink-0 truncate text-2xs">
                {entry.key}
              </code>
              <input
                className={cn(FIELD_CLASS, "min-w-0 flex-1 font-mono")}
                data-testid={`env-value-${entry.key}`}
                onChange={(event) => {
                  const env = [...defaults.env];
                  env[index] = { ...entry, value: event.target.value };
                  update({ env });
                }}
                type={
                  entry.secret && !revealed.has(entry.key) ? "password" : "text"
                }
                value={entry.value}
              />
              {entry.secret && (
                <button
                  aria-label={
                    revealed.has(entry.key) ? "値を隠す" : "値を表示する"
                  }
                  className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border hover:bg-accent"
                  data-testid={`env-reveal-${entry.key}`}
                  onClick={() => toggleReveal(entry.key)}
                  type="button"
                >
                  {revealed.has(entry.key) ? (
                    <EyeOff aria-hidden className="size-3.5" />
                  ) : (
                    <Eye aria-hidden className="size-3.5" />
                  )}
                </button>
              )}
              <button
                aria-label={`${entry.key} を削除`}
                className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border text-destructive hover:bg-destructive/10"
                data-testid={`env-remove-${entry.key}`}
                onClick={() =>
                  update({
                    env: defaults.env.filter((row) => row.key !== entry.key),
                  })
                }
                type="button"
              >
                <Trash2 aria-hidden className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
        <button
          className="flex w-fit items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-2xs font-medium hover:bg-accent"
          data-testid="env-add"
          onClick={() =>
            update({
              env: [
                ...defaults.env,
                {
                  key: `NEW_VAR_${defaults.env.length + 1}`,
                  value: "",
                  secret: false,
                },
              ],
            })
          }
          type="button"
        >
          <Plus aria-hidden className="size-3" />
          変数を追加
        </button>
      </div>

      <div className="flex items-center gap-3 border-t border-border pt-4">
        <button
          className="rounded-md bg-primary px-3 py-1.5 text-2xs font-medium text-primary-foreground disabled:opacity-60"
          data-testid="save-agent-defaults"
          disabled={store === null || !dirty}
          onClick={() => {
            store?.((current) => setAgentDefaults(current, defaults));
            // Drop the working copy so the panel reads from the committed values
            // again; keeping it would hide the next change made elsewhere.
            setDraft(null);
            toast.success("既定値を保存しました");
          }}
          type="button"
        >
          保存する
        </button>
        {dirty ? (
          <button
            className="rounded-md px-3 py-1.5 text-2xs font-medium text-muted-foreground hover:text-foreground"
            data-testid="discard-agent-defaults"
            onClick={() => setDraft(null)}
            type="button"
          >
            変更を捨てる
          </button>
        ) : (
          <p className="text-badge text-muted-foreground">変更はありません。</p>
        )}
      </div>
    </div>
  );
}
