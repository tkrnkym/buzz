import { Copy, LayoutTemplate, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  addChannelTemplate,
  duplicateChannelTemplate,
  removeChannelTemplate,
  updateChannelTemplate,
} from "@/features/channels/channel-template-mutations";
import {
  nextMockId,
  useShowcase,
  useShowcaseUpdate,
} from "@/features/showcase/use-showcase";
import type { ChannelTemplate } from "@/mock/showcase";
import { cn } from "@/shared/lib/cn";
import { Dialog } from "@/shared/ui/dialog";
import { PubkeyAvatar } from "@/shared/ui/PubkeyAvatar";

const FIELD_CLASS =
  "w-full rounded-md border border-border bg-background px-2.5 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

/** A blank template, for the create path. */
function emptyTemplate(): ChannelTemplate {
  return {
    id: "",
    name: "",
    description: "",
    canvasTemplate: "",
    agentIds: [],
    usedCount: 0,
  };
}

function TemplateDialog({
  agents,
  onClose,
  onSave,
  template,
}: {
  agents: {
    id: string;
    name: string;
    pubkey: string;
    avatarUrl: string | null;
  }[];
  onClose: () => void;
  onSave: (template: ChannelTemplate) => void;
  template: ChannelTemplate;
}) {
  const [draft, setDraft] = useState(template);
  const isNew = template.id === "";

  return (
    <Dialog
      description="この形でチャンネルを作れるようにします。招くエージェントもいっしょに覚えます。"
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
            data-testid="save-template"
            disabled={!draft.name.trim()}
            onClick={() => onSave(draft)}
            type="button"
          >
            {isNew ? "作成する" : "保存する"}
          </button>
        </>
      }
      onClose={onClose}
      open
      testId="template-dialog"
      title={isNew ? "テンプレートを作る" : "テンプレートを編集"}
    >
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-2xs font-medium text-muted-foreground">
            名前
          </span>
          <input
            className={FIELD_CLASS}
            data-testid="template-name"
            onChange={(event) =>
              setDraft({ ...draft, name: event.target.value })
            }
            placeholder="障害対応"
            value={draft.name}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-2xs font-medium text-muted-foreground">
            説明（省略可）
          </span>
          <textarea
            className={cn(FIELD_CLASS, "min-h-16 resize-y")}
            data-testid="template-description"
            onChange={(event) =>
              setDraft({ ...draft, description: event.target.value })
            }
            placeholder="このテンプレートが何のためのものか"
            value={draft.description}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-2xs font-medium text-muted-foreground">
            Canvas テンプレート（省略可）
          </span>
          <textarea
            className={cn(FIELD_CLASS, "min-h-24 resize-y font-mono text-2xs")}
            data-testid="template-canvas"
            onChange={(event) =>
              setDraft({ ...draft, canvasTemplate: event.target.value })
            }
            placeholder="Canvas の内容..."
            value={draft.canvasTemplate}
          />
          <span className="text-badge text-muted-foreground">
            {
              "{channel.name} と {template.name} をプレースホルダーとして使えます。"
            }
          </span>
        </label>

        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-0.5 text-2xs font-medium text-muted-foreground">
            あなたのエージェント
          </legend>
          <ul className="flex flex-col gap-1">
            {agents.map((agent) => {
              const picked = draft.agentIds.includes(agent.id);
              return (
                <li key={agent.id}>
                  <label
                    className="flex cursor-pointer items-center gap-2.5 rounded-md px-1.5 py-1.5 hover:bg-accent"
                    htmlFor={`template-agent-${agent.id}`}
                  >
                    <PubkeyAvatar
                      avatarUrl={agent.avatarUrl}
                      label={agent.name}
                      pubkey={agent.pubkey}
                      shape="circle"
                      size="sm"
                    />
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {agent.name}
                    </span>
                    <input
                      checked={picked}
                      className="size-4 shrink-0 rounded border-border"
                      data-testid={`template-agent-${agent.id}`}
                      id={`template-agent-${agent.id}`}
                      onChange={() =>
                        setDraft({
                          ...draft,
                          agentIds: picked
                            ? draft.agentIds.filter((id) => id !== agent.id)
                            : [...draft.agentIds, agent.id],
                        })
                      }
                      type="checkbox"
                    />
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>
      </div>
    </Dialog>
  );
}

/**
 * Channel templates — the rooms someone opens over and over.
 *
 * Kept because the tedious part of an incident channel is rarely its name: it is
 * re-adding the same three agents and re-typing the same topic while something is
 * on fire. So the agent list is part of the template, not a separate step.
 *
 * The use count is shown because it is the only honest way to sort these. A
 * template nobody has used in six months is a candidate for deletion, and
 * alphabetical order hides that.
 */
export function ChannelTemplatesSettings() {
  const showcase = useShowcase();
  const update = useShowcaseUpdate();
  const templates = showcase?.channelTemplates ?? null;
  const [editing, setEditing] = useState<ChannelTemplate | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ChannelTemplate | null>(
    null,
  );

  if (!showcase || !templates) {
    return (
      <p className="text-2xs text-muted-foreground">
        テンプレートはまだリレーから読めていません。
      </p>
    );
  }

  const agents = showcase.agents.map((agent) => ({
    id: agent.id,
    name: agent.name,
    pubkey: agent.pubkey,
    avatarUrl: agent.avatarUrl,
  }));
  const nameOf = (id: string) =>
    agents.find((agent) => agent.id === id)?.name ?? id;

  const save = (draft: ChannelTemplate) => {
    if (draft.id === "") {
      const id = nextMockId("tpl");
      update?.((current) => addChannelTemplate(current, { ...draft, id }));
      toast.success("テンプレートを作りました");
    } else {
      update?.((current) => updateChannelTemplate(current, draft));
      toast.success("テンプレートを更新しました");
    }
    setEditing(null);
  };

  return (
    <div className="flex flex-col gap-3" data-testid="channel-templates">
      <ul className="flex flex-col gap-2">
        {templates.length === 0 && (
          <li className="text-2xs text-muted-foreground">
            テンプレートはまだありません。
          </li>
        )}
        {[...templates]
          .sort((left, right) => right.usedCount - left.usedCount)
          .map((template) => (
            <li
              className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-3 py-2.5"
              data-testid={`template-${template.id}`}
              key={template.id}
            >
              <span className="shrink-0 text-muted-foreground">
                <LayoutTemplate aria-hidden className="size-3.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {template.name}
                </span>
                <span className="block truncate text-badge text-muted-foreground">
                  {template.description || "説明なし"}
                  {template.agentIds.length > 0 &&
                    ` · ${template.agentIds.map(nameOf).join("、")}`}
                  {` · ${template.usedCount} 回使用`}
                </span>
              </span>

              <button
                aria-label={`${template.name} を編集`}
                className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border hover:bg-accent"
                data-testid={`edit-template-${template.id}`}
                onClick={() => setEditing(template)}
                type="button"
              >
                <Pencil aria-hidden className="size-3" />
              </button>
              <button
                aria-label={`${template.name} を複製`}
                className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border hover:bg-accent"
                data-testid={`duplicate-template-${template.id}`}
                disabled={update === null}
                onClick={() => {
                  update?.((current) =>
                    duplicateChannelTemplate(
                      current,
                      template.id,
                      nextMockId("tpl"),
                    ),
                  );
                  toast.success("複製しました");
                }}
                type="button"
              >
                <Copy aria-hidden className="size-3" />
              </button>
              <button
                aria-label={`${template.name} を削除`}
                className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border text-destructive hover:bg-destructive/10"
                data-testid={`delete-template-${template.id}`}
                onClick={() => setConfirmDelete(template)}
                type="button"
              >
                <Trash2 aria-hidden className="size-3" />
              </button>
            </li>
          ))}
      </ul>

      <button
        className="flex w-fit items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-2xs font-medium hover:bg-accent"
        data-testid="add-template"
        onClick={() => setEditing(emptyTemplate())}
        type="button"
      >
        <Plus aria-hidden className="size-3" />
        テンプレートを作る
      </button>

      {editing && (
        <TemplateDialog
          agents={agents}
          onClose={() => setEditing(null)}
          onSave={save}
          template={editing}
        />
      )}

      {confirmDelete && (
        <Dialog
          // Named in the question rather than "this template": a confirmation
          // that does not say what it is about is one people click through.
          description={`「${confirmDelete.name}」を削除します。作成済みのチャンネルには影響しません。`}
          footer={
            <>
              <button
                className="rounded-md px-3 py-1.5 text-2xs font-medium text-muted-foreground hover:text-foreground"
                onClick={() => setConfirmDelete(null)}
                type="button"
              >
                やめる
              </button>
              <button
                className="rounded-md bg-destructive px-3 py-1.5 text-2xs font-medium text-destructive-foreground"
                data-testid="confirm-delete-template"
                onClick={() => {
                  update?.((current) =>
                    removeChannelTemplate(current, confirmDelete.id),
                  );
                  setConfirmDelete(null);
                  toast.success("削除しました");
                }}
                type="button"
              >
                削除する
              </button>
            </>
          }
          onClose={() => setConfirmDelete(null)}
          open
          testId="delete-template-dialog"
          title="テンプレートを削除"
        >
          <p className="text-2xs text-muted-foreground">
            この操作は取り消せません。
          </p>
        </Dialog>
      )}
    </div>
  );
}
