import { ExternalLink, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AgentDefaultsSettings } from "@/features/agents/ui/AgentDefaultsSettings";
import {
  addHarness,
  removeCustomHarness,
} from "@/features/harness/harness-mutations";
import {
  SettingCard,
  SettingGroupHeading,
  SettingRow,
} from "@/features/settings/ui/SettingRow";
import { useKeepAwake } from "@/features/settings/use-wake-lock";
import { NotWiredUp } from "@/features/showcase/ui/ShowcasePage";
import {
  nextMockId,
  useShowcase,
  useShowcaseUpdate,
} from "@/features/showcase/use-showcase";
import { cn } from "@/shared/lib/cn";
import { Dialog } from "@/shared/ui/dialog";
import { FIELD_CONTROL_CLASS, FieldShell } from "@/shared/ui/field-row";
import { Switch } from "@/shared/ui/switch";

/**
 * Agents: how they behave, and what runs them.
 *
 * The two behaviour switches sit above the runtime list because they are about
 * conversations, which is where a reader met the problem — the list below is about
 * this machine.
 */
export function AgentsPanel() {
  const showcase = useShowcase();
  const update = useShowcaseUpdate();
  const keepAwake = useKeepAwake();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [command, setCommand] = useState("");
  const [checking, setChecking] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <SettingCard>
        <SettingRow
          description="話しかけたエージェントを、同じチャンネルやスレッドの次のメッセージでも選んだままにします。入力欄からいつでも外せます。"
          testId="keep-addressed-row"
          title="Keep addressed agents active"
        >
          {/* Disabled with the reason stated. The composer does not address agents
              yet, so a working switch here would store a preference nothing reads —
              which is worse than a control that admits it is waiting on something. */}
          <span className="flex items-center gap-2">
            <span className="text-badge text-muted-foreground">
              入力欄がまだ対応していません
            </span>
            <Switch checked={false} data-testid="keep-addressed" disabled />
          </span>
        </SettingRow>

        <SettingRow
          description={
            keepAwake.supported
              ? "ローカルのエージェントが動いているあいだ、画面が消えないようにします。ブラウザが持てるのは画面のロックだけなので、ふたを閉じればスリープします。"
              : "このブラウザは画面のロックに対応していません。"
          }
          testId="keep-awake-row"
          title="Keep awake while agents are active"
        >
          <Switch
            checked={keepAwake.enabled}
            data-testid="keep-awake"
            disabled={!keepAwake.supported}
            onCheckedChange={keepAwake.setEnabled}
          />
        </SettingRow>
      </SettingCard>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <SettingGroupHeading>Agent runtimes</SettingGroupHeading>
          <p className="mt-0.5 text-2xs text-muted-foreground">
            この端末で Buzz が使えるエージェントのツールを選びます。
          </p>
        </div>
        <button
          className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-2xs font-medium hover:bg-accent disabled:opacity-60"
          data-testid="recheck-runtimes"
          disabled={checking}
          onClick={() => {
            // The browser cannot probe for a local binary, so there is nothing to
            // re-run. Saying that beats a spinner that always returns the same list.
            setChecking(true);
            window.setTimeout(() => {
              setChecking(false);
              toast.info(
                "ブラウザからはローカルのコマンドを調べられないので、この一覧は変わりません。",
              );
            }, 400);
          }}
          type="button"
        >
          <RefreshCw
            aria-hidden
            className={cn("size-3", checking && "animate-spin")}
          />
          Check again
        </button>
      </div>

      {!showcase ? (
        <NotWiredUp what="ハーネスの一覧" />
      ) : (
        <>
          <div className="flex flex-col gap-2" data-testid="harness-settings">
            {showcase.harnesses.map((harness) => (
              <div
                className="rounded-xl border border-border bg-card px-4 py-3.5"
                data-testid={`harness-${harness.id}`}
                key={harness.id}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{harness.name}</span>
                    {harness.custom && (
                      <span className="rounded bg-secondary px-1.5 py-0.5 text-badge text-secondary-foreground">
                        自分で追加
                      </span>
                    )}
                    {!harness.available && (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-badge text-muted-foreground">
                        CLI needed
                      </span>
                    )}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {harness.available ? (
                      <span className="rounded bg-status-added/15 px-2 py-0.5 text-badge font-medium text-status-added">
                        Ready
                      </span>
                    ) : (
                      <a
                        className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-badge font-medium hover:bg-accent"
                        href={harness.installUrl}
                        rel="noreferrer noopener"
                        target="_blank"
                      >
                        Install
                      </a>
                    )}
                    {update && harness.custom && (
                      <button
                        aria-label={`${harness.name} を削除`}
                        className="flex size-7 items-center justify-center rounded-md border border-border text-destructive hover:bg-destructive/10"
                        data-testid={`remove-harness-${harness.id}`}
                        onClick={() => {
                          update((current) =>
                            removeCustomHarness(current, harness.id),
                          );
                          toast.success(`${harness.name} を削除しました`);
                        }}
                        type="button"
                      >
                        <Trash2 aria-hidden className="size-3" />
                      </button>
                    )}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-2xs text-muted-foreground">
                    {harness.available
                      ? `${harness.command}${harness.version ? ` · ${harness.version}` : ""}`
                      : `Buzz は ${harness.command} を通して ${harness.name} と話します。`}
                  </span>
                  {!harness.available && (
                    <a
                      className="flex items-center gap-1 text-badge text-muted-foreground hover:text-foreground"
                      href={harness.installUrl}
                      rel="noreferrer noopener"
                      target="_blank"
                    >
                      <ExternalLink aria-hidden className="size-2.5" />
                      CLI setup guide
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>

          <button
            className="flex w-fit items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-2xs font-medium hover:bg-accent disabled:opacity-60"
            data-testid="add-harness"
            disabled={update === null}
            onClick={() => {
              setName("");
              setCommand("");
              setAdding(true);
            }}
            type="button"
          >
            <Plus aria-hidden className="size-3" />
            Add runtimes
          </button>
        </>
      )}

      <SettingGroupHeading>既定値</SettingGroupHeading>
      <p className="-mt-3 text-2xs text-muted-foreground">
        ローカルのエージェントが引き継ぐ設定。個別の指定が常に優先されます。
      </p>
      <AgentDefaultsSettings />

      {adding && update && (
        <Dialog
          description="実行するコマンドを指定します。ACP を話せるものであれば何でも登録できます。"
          footer={
            <>
              <button
                className="rounded-md px-3 py-1.5 text-2xs font-medium text-muted-foreground hover:text-foreground"
                onClick={() => setAdding(false)}
                type="button"
              >
                キャンセル
              </button>
              <button
                className="rounded-md bg-primary px-3 py-1.5 text-2xs font-medium text-primary-foreground disabled:opacity-60"
                data-testid="save-harness"
                disabled={!name.trim() || !command.trim()}
                onClick={() => {
                  update((current) =>
                    addHarness(current, {
                      id: nextMockId("harness"),
                      name: name.trim(),
                      command: command.trim(),
                    }),
                  );
                  toast.success(`${name.trim()} を追加しました`);
                  setAdding(false);
                }}
                type="button"
              >
                追加する
              </button>
            </>
          }
          onClose={() => setAdding(false)}
          open
          testId="add-harness-dialog"
          title="ランタイムを追加"
        >
          <div className="flex flex-col gap-3">
            <FieldShell className="px-3 py-2">
              <input
                aria-label="表示名"
                className={FIELD_CONTROL_CLASS}
                data-testid="harness-name"
                onChange={(event) => setName(event.target.value)}
                placeholder="My Agent CLI"
                value={name}
              />
            </FieldShell>
            <FieldShell className="px-3 py-2">
              <input
                aria-label="コマンド"
                className={FIELD_CONTROL_CLASS}
                data-testid="harness-command"
                onChange={(event) => setCommand(event.target.value)}
                placeholder="my-agent --acp"
                value={command}
              />
            </FieldShell>
          </div>
        </Dialog>
      )}
    </div>
  );
}
