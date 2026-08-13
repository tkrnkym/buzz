import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Check, Pause, Pencil, Play, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { formatRelativeTime } from "@/features/agents/agent-model";
import {
  formatDuration,
  latestRun,
  RUN_STATE_PROGRESS,
} from "@/features/workflows/workflow-model";
import { WorkflowRunTrace } from "@/features/workflows/ui/WorkflowRunTrace";
import {
  formFromWorkflow,
  removeWorkflow,
  replaceWorkflow,
  resolveApproval,
  setWorkflowEnabled,
  workflowFromForm,
} from "@/features/workflows/workflow-mutations";
import { WorkflowFormDialog } from "@/features/workflows/ui/WorkflowFormDialog";
import { NotWiredUp, ShowcasePage } from "@/features/showcase/ui/ShowcasePage";
import {
  useShowcase,
  useShowcaseUpdate,
} from "@/features/showcase/use-showcase";
import { Dialog } from "@/shared/ui/dialog";
import { ProgressBadge } from "@/shared/ui/ProgressBadge";

/**
 * One workflow: what starts it, what it does, and what happened last time.
 *
 * A run held for approval gets its decision buttons at the top rather than
 * buried under the trace — it is the only thing on this page anyone has to act
 * on, and the trace is there to explain the decision, not to precede it.
 */
export function WorkflowDetailPage({ workflowId }: { workflowId: string }) {
  const showcase = useShowcase();
  const update = useShowcaseUpdate();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const nowSeconds = useMemo(() => Math.floor(Date.now() / 1000), []);
  const workflow = showcase?.workflows.find(
    (candidate) => candidate.id === workflowId,
  );

  if (!workflow) {
    return (
      <ShowcasePage title="Workflows">
        {showcase ? (
          <p className="text-sm text-muted-foreground">
            そのワークフローはありません。
          </p>
        ) : (
          <NotWiredUp what="ワークフロー" />
        )}
      </ShowcasePage>
    );
  }

  const run = latestRun(workflow);

  return (
    <ShowcasePage
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {update && (
            <>
              <button
                className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-2xs font-medium hover:bg-accent"
                data-testid="toggle-workflow-enabled"
                onClick={() => {
                  update((current) =>
                    setWorkflowEnabled(current, workflow.id, !workflow.enabled),
                  );
                  toast.success(
                    workflow.enabled
                      ? "停止しました。新しい実行は始まりません。"
                      : "再開しました。",
                  );
                }}
                type="button"
              >
                {workflow.enabled ? (
                  <Pause aria-hidden className="size-3" />
                ) : (
                  <Play aria-hidden className="size-3" />
                )}
                {workflow.enabled ? "停止" : "再開"}
              </button>
              <button
                className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-2xs font-medium hover:bg-accent"
                data-testid="edit-workflow"
                onClick={() => setEditing(true)}
                type="button"
              >
                <Pencil aria-hidden className="size-3" />
                編集
              </button>
              <button
                className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-2xs font-medium text-destructive hover:bg-destructive/10"
                data-testid="delete-workflow"
                onClick={() => setConfirmDelete(true)}
                type="button"
              >
                <Trash2 aria-hidden className="size-3" />
                削除
              </button>
            </>
          )}
          <Link
            className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-2xs font-medium hover:bg-accent"
            to="/workflows"
          >
            <ArrowLeft aria-hidden className="size-3" />
            一覧へ
          </Link>
        </div>
      }
      subtitle={`${workflow.triggerDetail} · #${workflow.channel}`}
      title={workflow.name}
    >
      <p className="text-sm text-muted-foreground">{workflow.description}</p>

      {run?.state === "waiting" && (
        <div
          className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-primary/40 bg-primary/5 px-4 py-3"
          data-testid="workflow-approval"
        >
          <p className="min-w-0 flex-1 text-2xs">
            この実行は承認を待っています。
          </p>
          <div className="flex gap-2">
            <button
              className="flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-2xs font-medium text-primary-foreground disabled:opacity-60"
              data-testid="approve-run"
              disabled={update === null}
              onClick={() => {
                update?.((current) =>
                  resolveApproval(current, workflow.id, run.id, "approve"),
                );
                toast.success("承認しました。続きが実行されます。");
              }}
              type="button"
            >
              <Check aria-hidden className="size-3" />
              承認
            </button>
            <button
              className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-2xs font-medium disabled:opacity-60"
              data-testid="reject-run"
              disabled={update === null}
              onClick={() => {
                update?.((current) =>
                  resolveApproval(current, workflow.id, run.id, "reject"),
                );
                toast.success("却下しました。この実行は止まります。");
              }}
              type="button"
            >
              <X aria-hidden className="size-3" />
              却下
            </button>
          </div>
        </div>
      )}

      {run ? (
        <section className="mt-6">
          <h2 className="flex items-center gap-2 text-2xs font-medium uppercase tracking-wide text-muted-foreground">
            最新の実行
            <ProgressBadge
              className="normal-case tracking-normal"
              status={RUN_STATE_PROGRESS[run.state]}
            />
            <span className="font-normal normal-case tracking-normal text-muted-foreground">
              {formatRelativeTime(run.startedAt, nowSeconds)} ·{" "}
              {formatDuration(run.durationMs || null)}
            </span>
          </h2>
          <div className="mt-3">
            <WorkflowRunTrace run={run} />
          </div>
        </section>
      ) : (
        <p className="mt-6 text-2xs text-muted-foreground">
          まだ一度も実行されていません。
        </p>
      )}

      {workflow.runs.length > 1 && (
        <section className="mt-8">
          <h2 className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
            これまでの実行
          </h2>
          <ul className="mt-2 flex flex-col gap-1" data-testid="workflow-runs">
            {workflow.runs.slice(1).map((entry) => (
              <li
                className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
                key={entry.id}
              >
                <span className="min-w-0 truncate text-2xs text-muted-foreground">
                  {formatRelativeTime(entry.startedAt, nowSeconds)} ·{" "}
                  {entry.trigger}
                </span>
                <span className="shrink-0 text-badge text-muted-foreground">
                  {formatDuration(entry.durationMs || null)}
                </span>
                <ProgressBadge status={RUN_STATE_PROGRESS[entry.state]} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {editing && update && (
        <WorkflowFormDialog
          initial={formFromWorkflow(workflow)}
          onClose={() => setEditing(false)}
          onSave={(form) => {
            update((current) =>
              replaceWorkflow(
                current,
                workflowFromForm(form, workflow.id, workflow),
              ),
            );
            setEditing(false);
            toast.success("保存しました");
          }}
        />
      )}

      {confirmDelete && update && (
        <Dialog
          // The run history is named, because that is the part someone would not
          // think to worry about until it was gone.
          description={`「${workflow.name}」と、その実行履歴 ${workflow.runs.length} 件を削除します。`}
          footer={
            <>
              <button
                className="rounded-md px-3 py-1.5 text-2xs font-medium text-muted-foreground hover:text-foreground"
                onClick={() => setConfirmDelete(false)}
                type="button"
              >
                やめる
              </button>
              <button
                className="rounded-md bg-destructive px-3 py-1.5 text-2xs font-medium text-destructive-foreground"
                data-testid="confirm-delete-workflow"
                onClick={() => {
                  update((current) => removeWorkflow(current, workflow.id));
                  setConfirmDelete(false);
                  toast.success("削除しました");
                  // Leaving first: this page is about to have nothing to render.
                  void navigate({ to: "/workflows" });
                }}
                type="button"
              >
                削除する
              </button>
            </>
          }
          onClose={() => setConfirmDelete(false)}
          open
          testId="delete-workflow-dialog"
          title="ワークフローを削除"
        >
          <p className="text-2xs text-muted-foreground">
            この操作は取り消せません。
          </p>
        </Dialog>
      )}
    </ShowcasePage>
  );
}
