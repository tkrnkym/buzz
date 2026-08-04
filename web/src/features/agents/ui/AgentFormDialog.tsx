import { Hash } from "lucide-react";
import { useState } from "react";

import type { ShowcaseAgent } from "@/mock/showcase";
import { useShowcase } from "@/features/showcase/use-showcase";
import { cn } from "@/shared/lib/cn";
import { Dialog } from "@/shared/ui/dialog";

const FIELD_CLASS =
  "h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

export interface AgentDraft {
  name: string;
  purpose: string;
  harness: string;
  model: string;
  channels: string[];
}

export function draftFromAgent(agent: ShowcaseAgent): AgentDraft {
  return {
    name: agent.name,
    purpose: agent.purpose,
    harness: agent.harness,
    model: agent.model,
    channels: agent.channels,
  };
}

/**
 * Create or edit an agent.
 *
 * The channel picker is part of the form rather than a later step, because an
 * agent in no channels cannot do anything and cannot be seen doing it — the
 * desktop client made adding one a separate dialog, and the common result was an
 * agent that looked broken until someone remembered.
 *
 * Defaults come from the community's agent defaults, so the two harness lists
 * cannot disagree and the common case is one field: a name.
 */
export function AgentFormDialog({
  initial,
  onClose,
  onSave,
}: {
  initial: AgentDraft | null;
  onClose: () => void;
  onSave: (draft: AgentDraft) => void;
}) {
  const showcase = useShowcase();
  const defaults = showcase?.agentDefaults;
  const [draft, setDraft] = useState<AgentDraft>(
    initial ?? {
      name: "",
      purpose: "",
      harness:
        showcase?.harnesses.find((row) => row.id === defaults?.harnessId)
          ?.name ?? "sprig",
      model: defaults?.model ?? "claude-opus-5",
      channels: [],
    },
  );

  const isNew = initial === null;
  // Channels come from the demo's own rooms, so the picker cannot offer one that
  // does not exist.
  const rooms = [
    ...new Set(
      (showcase?.agents ?? [])
        .flatMap((agent) => agent.channels)
        .concat(["general", "dev", "design", "random"]),
    ),
  ].sort();

  return (
    <Dialog
      description="役割と、どのチャンネルに入れるかを決めます。あとから変えられます。"
      footer={
        <>
          <button
            className="rounded-md px-3 py-1.5 text-2xs font-medium text-muted-foreground hover:text-foreground"
            onClick={onClose}
            type="button"
          >
            キャンセル
          </button>
          <button
            className="rounded-md bg-primary px-3 py-1.5 text-2xs font-medium text-primary-foreground disabled:opacity-60"
            data-testid="save-agent"
            disabled={!draft.name.trim() || !draft.purpose.trim()}
            onClick={() => onSave(draft)}
            type="button"
          >
            {isNew ? "作成する" : "保存する"}
          </button>
        </>
      }
      onClose={onClose}
      open
      testId="agent-form-dialog"
      title={isNew ? "エージェントを作る" : "エージェントを編集"}
    >
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-2xs font-medium text-muted-foreground">
            名前
          </span>
          <input
            className={FIELD_CLASS}
            data-testid="agent-name"
            onChange={(event) =>
              setDraft({ ...draft, name: event.target.value })
            }
            placeholder="レビュー係"
            value={draft.name}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-2xs font-medium text-muted-foreground">
            役割
          </span>
          <input
            className={FIELD_CLASS}
            data-testid="agent-purpose"
            onChange={(event) =>
              setDraft({ ...draft, purpose: event.target.value })
            }
            placeholder="変更をレビューして指摘する"
            value={draft.purpose}
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-2xs font-medium text-muted-foreground">
              ハーネス
            </span>
            <select
              className={FIELD_CLASS}
              data-testid="agent-harness"
              onChange={(event) =>
                setDraft({ ...draft, harness: event.target.value })
              }
              value={draft.harness}
            >
              {(showcase?.harnesses ?? []).map((harness) => (
                // A harness that is not installed stays selectable: an agent can
                // be defined now and run once it is there.
                <option key={harness.id} value={harness.name}>
                  {harness.name}
                  {harness.available ? "" : "（未インストール）"}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-2xs font-medium text-muted-foreground">
              モデル
            </span>
            <input
              className={FIELD_CLASS}
              data-testid="agent-model"
              onChange={(event) =>
                setDraft({ ...draft, model: event.target.value })
              }
              value={draft.model}
            />
          </label>
        </div>

        <fieldset className="flex flex-col gap-1.5">
          <legend className="text-2xs font-medium text-muted-foreground">
            入れるチャンネル
          </legend>
          <div className="flex flex-wrap gap-1.5">
            {rooms.map((room) => {
              const picked = draft.channels.includes(room);
              return (
                <button
                  aria-pressed={picked}
                  className={cn(
                    "flex items-center gap-1 rounded-md border px-2 py-1 text-badge transition-colors",
                    picked
                      ? "border-primary bg-primary/10 font-medium"
                      : "border-border hover:bg-accent",
                  )}
                  data-testid={`agent-channel-${room}`}
                  key={room}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      channels: picked
                        ? draft.channels.filter((name) => name !== room)
                        : [...draft.channels, room],
                    })
                  }
                  type="button"
                >
                  <Hash aria-hidden className="size-2.5" />
                  {room}
                </button>
              );
            })}
          </div>
          {draft.channels.length === 0 && (
            <span className="text-badge text-muted-foreground">
              どこにも入れないと、話しかける場所がありません。
            </span>
          )}
        </fieldset>
      </div>
    </Dialog>
  );
}
