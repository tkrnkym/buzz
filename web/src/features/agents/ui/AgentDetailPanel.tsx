import { Bot, Pause, Pencil, Play, Trash2 } from "lucide-react";

import {
  AGENT_STATUS_DOT,
  AGENT_STATUS_LABELS,
  formatRelativeTime,
} from "@/features/agents/agent-model";
import { MemorySection } from "@/features/agents/ui/MemorySection";
import { resolveUserLabel } from "@/features/profile/profile-model";
import { useProfiles } from "@/features/profile/profile-store";
import type { ShowcaseAgent } from "@/mock/showcase";
import { cn } from "@/shared/lib/cn";
import { truncatePubkey } from "@/shared/lib/pubkey";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-2xs text-muted-foreground">{label}</dt>
      <dd className="break-words text-sm">{value}</dd>
    </div>
  );
}

/**
 * The panel beside the agent list.
 *
 * Shows the configuration an operator would need to answer "why is it doing
 * that" — harness, model, owner, which rooms it is in — because an agent's
 * behaviour is not visible from its name and every question about one starts
 * there.
 *
 * The controls act on the demo's own fixtures. Without a store to write to they
 * are disabled and the panel says why — a Pause button that silently does nothing
 * is worse than one that admits it.
 */
export function AgentDetailPanel({
  agent,
  nowSeconds,
  onDelete,
  onEdit,
  onTogglePaused,
}: {
  agent: ShowcaseAgent;
  nowSeconds: number;
  /** Omitted when there is nothing to write to; the controls then say so. */
  onDelete?: () => void;
  onEdit?: () => void;
  onTogglePaused?: () => void;
}) {
  const profiles = useProfiles([agent.ownerPubkey]);
  const owner = resolveUserLabel({
    pubkey: agent.ownerPubkey,
    profiles,
    preferResolvedSelfLabel: true,
  });

  return (
    <aside
      aria-label={`${agent.name} の設定`}
      className="flex w-80 shrink-0 flex-col gap-4 border-l border-border p-4"
      data-testid="agent-detail-panel"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-secondary">
          <Bot aria-hidden className="size-5 text-secondary-foreground" />
        </span>
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">{agent.name}</h2>
          <p className="mt-0.5 flex items-center gap-1.5 text-2xs text-muted-foreground">
            <span
              aria-hidden
              className={cn(
                "size-1.5 rounded-full",
                AGENT_STATUS_DOT[agent.status],
              )}
            />
            {AGENT_STATUS_LABELS[agent.status]} ·{" "}
            {formatRelativeTime(agent.lastActiveAt, nowSeconds)}
          </p>
        </div>
      </div>

      {agent.activity && (
        <p className="rounded-md bg-primary/10 px-2.5 py-2 text-2xs text-primary">
          {agent.activity}
        </p>
      )}

      <dl className="flex flex-col gap-3">
        <Field label="役割" value={agent.purpose} />
        <Field label="ハーネス" value={agent.harness} />
        <Field label="モデル" value={agent.model} />
        <Field label="作成者" value={owner} />
        <Field label="公開鍵" value={truncatePubkey(agent.pubkey)} />
        <Field
          label="参加チャンネル"
          value={agent.channels.map((name) => `#${name}`).join("、") || "なし"}
        />
        <Field label="今日のターン数" value={`${agent.turnsToday}`} />
      </dl>

      <div className="flex flex-col gap-2 border-t border-border pt-3">
        <h3 className="text-2xs font-medium text-muted-foreground">メモリ</h3>
        <MemorySection agentPubkey={agent.pubkey} />
      </div>

      <div className="mt-auto flex flex-col gap-2">
        <div className="flex gap-2">
          <button
            className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-border px-2 py-1.5 text-2xs font-medium disabled:opacity-60"
            data-testid="toggle-agent-paused"
            disabled={!onTogglePaused}
            onClick={onTogglePaused}
            type="button"
          >
            {agent.status === "paused" ? (
              <Play aria-hidden className="size-3" />
            ) : (
              <Pause aria-hidden className="size-3" />
            )}
            {agent.status === "paused" ? "再開" : "一時停止"}
          </button>
          <button
            className="flex items-center justify-center gap-1.5 rounded-md border border-border px-2 py-1.5 text-2xs font-medium disabled:opacity-60"
            data-testid="edit-agent"
            disabled={!onEdit}
            onClick={onEdit}
            type="button"
          >
            <Pencil aria-hidden className="size-3" />
            編集
          </button>
          <button
            className="flex items-center justify-center gap-1.5 rounded-md border border-border px-2 py-1.5 text-2xs font-medium text-destructive disabled:opacity-60"
            data-testid="delete-agent"
            disabled={!onDelete}
            onClick={onDelete}
            type="button"
          >
            <Trash2 aria-hidden className="size-3" />
            削除
          </button>
        </div>
        {!onEdit && (
          <p className="text-badge text-muted-foreground">
            操作はまだリレーにつながっていません。
          </p>
        )}
      </div>
    </aside>
  );
}
