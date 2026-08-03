import { Check, ExternalLink, Plus, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { useShowcase } from "@/features/showcase/use-showcase";
import type { Harness } from "@/mock/showcase";
import { cn } from "@/shared/lib/cn";
import { Dialog } from "@/shared/ui/dialog";

const FIELD_CLASS =
  "h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

function HarnessRow({ harness }: { harness: Harness }) {
  return (
    <li
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2.5",
        harness.available
          ? "border-border"
          : "border-amber-500/30 bg-amber-500/5",
      )}
      data-testid={`harness-${harness.id}`}
    >
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-2">
          <span className="text-sm font-medium">{harness.name}</span>
          {harness.custom && (
            <span className="rounded bg-secondary px-1.5 py-0.5 text-badge text-secondary-foreground">
              自分で追加
            </span>
          )}
          <code className="text-badge text-muted-foreground">
            {harness.command}
          </code>
        </span>
        <span className="mt-0.5 flex items-center gap-1.5 text-badge">
          {harness.available ? (
            <>
              <Check aria-hidden className="size-3 text-primary" />
              <span className="text-muted-foreground">
                利用可能 · {harness.version}
              </span>
            </>
          ) : (
            <>
              <TriangleAlert aria-hidden className="size-3 text-amber-600" />
              <span className="text-muted-foreground">
                見つかりません。インストールすると使えます。
              </span>
            </>
          )}
        </span>
      </span>

      {!harness.available && (
        <a
          className="flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-badge hover:bg-accent"
          href={harness.installUrl}
          rel="noreferrer noopener"
          target="_blank"
        >
          <ExternalLink aria-hidden className="size-3" />
          入手する
        </a>
      )}
    </li>
  );
}

/**
 * The agent harnesses this machine can run.
 *
 * A harness that is *not* installed stays on the list, which is the point: the
 * reader's next question is how to get it, and hiding it would turn "not
 * installed" into "does not exist". The desktop client made the same call.
 *
 * The web client cannot actually probe for a local binary — there is no
 * filesystem here — so availability is mock data. That limit is stated on the
 * panel rather than implied by a list that looks live.
 */
export function HarnessSettings() {
  const showcase = useShowcase();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [command, setCommand] = useState("");

  if (!showcase) {
    return (
      <p className="text-2xs text-muted-foreground">
        ハーネスの一覧はまだリレーから読めていません。
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3" data-testid="harness-settings">
      <p className="text-2xs text-muted-foreground">
        ブラウザからはローカルのコマンドを調べられないので、この一覧は見た目の再現です。実際の判定はデスクトップ側の仕事になります。
      </p>

      <ul className="flex flex-col gap-2">
        {showcase.harnesses.map((harness) => (
          <HarnessRow harness={harness} key={harness.id} />
        ))}
      </ul>

      <button
        className="flex w-fit items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-2xs font-medium hover:bg-accent"
        data-testid="add-harness"
        onClick={() => {
          setName("");
          setCommand("");
          setAdding(true);
        }}
        type="button"
      >
        <Plus aria-hidden className="size-3" />
        ハーネスを追加
      </button>

      {adding && (
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
                  // Mock: nothing to persist to, and saying so beats a row that
                  // vanishes on reload without explanation.
                  toast.success(
                    `${name.trim()} を追加しました（この画面はモックなので保存されません）`,
                  );
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
          title="ハーネスを追加"
        >
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-2xs font-medium text-muted-foreground">
                表示名
              </span>
              <input
                className={FIELD_CLASS}
                data-testid="harness-name"
                onChange={(event) => setName(event.target.value)}
                placeholder="My Agent CLI"
                value={name}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-2xs font-medium text-muted-foreground">
                コマンド
              </span>
              <input
                className={FIELD_CLASS}
                data-testid="harness-command"
                onChange={(event) => setCommand(event.target.value)}
                placeholder="my-agent --acp"
                value={command}
              />
            </label>
          </div>
        </Dialog>
      )}
    </div>
  );
}
