import { ChevronDown, ChevronUp, Code2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import {
  ACTION_LABELS,
  ACTION_TYPES,
  canSaveWorkflow,
  emptyStep,
  FIELD_LABELS,
  moveStep,
  type StepForm,
  stepFields,
  toWorkflowYaml,
  TRIGGER_LABELS,
  TRIGGER_TYPES,
  triggerFields,
  validateWorkflowForm,
  type WorkflowForm,
} from "@/features/workflows/workflow-form";
import { nextMockId } from "@/features/showcase/use-showcase";
import { cn } from "@/shared/lib/cn";
import { Dialog } from "@/shared/ui/dialog";

const FIELD_CLASS =
  "h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

const PLACEHOLDERS: Record<string, string> = {
  filter: "#dev",
  emoji: "🚀",
  cron: "0 10 * * 5",
  channel: "#general",
  text: "リリース候補ができました",
  to: "@佐藤 美咲",
  url: "https://example.com/hook",
  method: "POST",
  topic: "リリース作業中",
  duration: "30s",
};

/** One step's editor. Which fields appear is decided by its action. */
function StepEditor({
  index,
  onChange,
  onMove,
  onRemove,
  problems,
  step,
  total,
}: {
  index: number;
  onChange: (step: StepForm) => void;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
  problems: string[];
  step: StepForm;
  total: number;
}) {
  return (
    <li
      className={cn(
        "rounded-lg border px-3 py-2.5",
        problems.length > 0 ? "border-destructive/40" : "border-border",
      )}
      data-testid={`step-${step.id}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-badge text-muted-foreground">{index + 1}</span>
        <select
          aria-label={`${index + 1} 番目のステップの動作`}
          className={cn(FIELD_CLASS, "w-auto min-w-0 flex-1")}
          data-testid={`step-action-${step.id}`}
          onChange={(event) =>
            onChange({
              ...step,
              action: event.target.value as StepForm["action"],
            })
          }
          value={step.action}
        >
          {ACTION_TYPES.map((action) => (
            <option key={action} value={action}>
              {ACTION_LABELS[action]}
            </option>
          ))}
        </select>

        {/* Reordering matters more than it looks: steps run in order, and a
            condition on step 3 can only read what steps 1 and 2 produced. */}
        <button
          aria-label="上へ"
          className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border hover:bg-accent disabled:opacity-40"
          data-testid={`step-up-${step.id}`}
          disabled={index === 0}
          onClick={() => onMove(-1)}
          type="button"
        >
          <ChevronUp aria-hidden className="size-3" />
        </button>
        <button
          aria-label="下へ"
          className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border hover:bg-accent disabled:opacity-40"
          data-testid={`step-down-${step.id}`}
          disabled={index === total - 1}
          onClick={() => onMove(1)}
          type="button"
        >
          <ChevronDown aria-hidden className="size-3" />
        </button>
        <button
          aria-label={`${index + 1} 番目のステップを削除`}
          className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border text-destructive hover:bg-destructive/10"
          data-testid={`step-remove-${step.id}`}
          onClick={onRemove}
          type="button"
        >
          <Trash2 aria-hidden className="size-3" />
        </button>
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {stepFields(step.action).map((field) => (
          <label className="flex flex-col gap-1" key={field}>
            <span className="text-badge text-muted-foreground">
              {FIELD_LABELS[field] ?? field}
            </span>
            <input
              className={FIELD_CLASS}
              data-testid={`step-${field}-${step.id}`}
              onChange={(event) =>
                onChange({ ...step, [field]: event.target.value })
              }
              placeholder={PLACEHOLDERS[field]}
              value={String(step[field])}
            />
          </label>
        ))}
        <label className="flex flex-col gap-1">
          <span className="text-badge text-muted-foreground">条件（任意）</span>
          <input
            className={FIELD_CLASS}
            data-testid={`step-condition-${step.id}`}
            onChange={(event) =>
              onChange({ ...step, condition: event.target.value })
            }
            // Free text, never parsed here: guessing at evalexpr syntax would
            // reject valid expressions, and being wrong that way is unrecoverable
            // for the person writing one.
            placeholder="labels contains &quot;urgent&quot;"
            value={step.condition}
          />
        </label>
      </div>

      {problems.length > 0 && (
        <ul className="mt-1.5 flex flex-col gap-0.5">
          {problems.map((problem) => (
            <li className="text-badge text-destructive" key={problem}>
              {problem}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * Create or edit a workflow.
 *
 * A form rather than a YAML editor, with the YAML on show behind a toggle. The
 * engine reads YAML, so hiding it entirely would leave a reader unable to check
 * what they built or paste it elsewhere — but a blank text area is a poor first
 * experience for something with five trigger kinds and seven actions.
 *
 * Every incomplete step is marked at once rather than one per submit. Someone who
 * built four steps and missed a field in the second should not have to press Save
 * four times to find that out — see `validateWorkflowForm`.
 */
export function WorkflowFormDialog({
  initial,
  onClose,
  onSave,
}: {
  initial: WorkflowForm;
  onClose: () => void;
  onSave: (form: WorkflowForm) => void;
}) {
  const [form, setForm] = useState(initial);
  const [showYaml, setShowYaml] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const problems = validateWorkflowForm(form);
  // Problems are hidden until the first Save attempt: a form that opens covered
  // in red before anyone has typed reads as broken rather than empty.
  const visible = submitted ? problems : [];
  const formProblems = visible.filter((problem) => problem.stepId === null);
  const problemsFor = (stepId: string) =>
    visible
      .filter((problem) => problem.stepId === stepId)
      .map((p) => p.message);

  const isNew = initial.name === "";

  return (
    <Dialog
      className="w-[min(46rem,calc(100vw-2rem))]"
      description="いつ動かすかと、何をするかを決めます。ステップは上から順に実行されます。"
      footer={
        <>
          <button
            className="mr-auto flex items-center gap-1.5 rounded-md px-2 py-1.5 text-2xs text-muted-foreground hover:text-foreground"
            data-testid="toggle-yaml"
            onClick={() => setShowYaml((current) => !current)}
            type="button"
          >
            <Code2 aria-hidden className="size-3" />
            {showYaml ? "フォームに戻る" : "YAML を見る"}
          </button>
          <button
            className="rounded-md px-3 py-1.5 text-2xs font-medium text-muted-foreground hover:text-foreground"
            onClick={onClose}
            type="button"
          >
            キャンセル
          </button>
          <button
            className="rounded-md bg-primary px-3 py-1.5 text-2xs font-medium text-primary-foreground disabled:opacity-60"
            data-testid="save-workflow"
            onClick={() => {
              setSubmitted(true);
              if (canSaveWorkflow(form)) onSave(form);
            }}
            type="button"
          >
            {isNew ? "作成する" : "保存する"}
          </button>
        </>
      }
      onClose={onClose}
      open
      testId="workflow-form-dialog"
      title={isNew ? "ワークフローを作る" : "ワークフローを編集"}
    >
      {showYaml ? (
        <pre
          className="max-h-96 overflow-auto rounded-md border border-border bg-muted/40 p-3 text-2xs"
          data-testid="workflow-yaml"
        >
          {toWorkflowYaml(form)}
        </pre>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-2xs font-medium text-muted-foreground">
                名前
              </span>
              <input
                className={FIELD_CLASS}
                data-testid="workflow-name"
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
                placeholder="リリース前チェック"
                value={form.name}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-2xs font-medium text-muted-foreground">
                説明（任意）
              </span>
              <input
                className={FIELD_CLASS}
                data-testid="workflow-description"
                onChange={(event) =>
                  setForm({ ...form, description: event.target.value })
                }
                placeholder="何のための手順か"
                value={form.description}
              />
            </label>
          </div>

          <fieldset className="flex flex-col gap-2 border-t border-border pt-4">
            <legend className="mb-1 text-2xs font-medium text-muted-foreground">
              いつ動かすか
            </legend>
            <select
              aria-label="トリガー"
              className={FIELD_CLASS}
              data-testid="workflow-trigger"
              onChange={(event) =>
                setForm({
                  ...form,
                  trigger: {
                    ...form.trigger,
                    on: event.target.value as (typeof TRIGGER_TYPES)[number],
                  },
                })
              }
              value={form.trigger.on}
            >
              {TRIGGER_TYPES.map((trigger) => (
                <option key={trigger} value={trigger}>
                  {TRIGGER_LABELS[trigger]}
                </option>
              ))}
            </select>
            {triggerFields(form.trigger.on).map((field) => (
              <label className="flex flex-col gap-1" key={field}>
                <span className="text-badge text-muted-foreground">
                  {FIELD_LABELS[field] ?? field}
                </span>
                <input
                  className={FIELD_CLASS}
                  data-testid={`trigger-${field}`}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      trigger: { ...form.trigger, [field]: event.target.value },
                    })
                  }
                  placeholder={PLACEHOLDERS[field]}
                  value={String(form.trigger[field])}
                />
              </label>
            ))}
            {form.trigger.on === "webhook" && (
              <p className="text-badge text-muted-foreground">
                URL はリレーが払い出します。作成後に詳細画面で確認できます。
              </p>
            )}
          </fieldset>

          <div className="flex flex-col gap-2 border-t border-border pt-4">
            <p className="text-2xs font-medium text-muted-foreground">
              何をするか
            </p>
            <ul className="flex flex-col gap-2">
              {form.steps.map((step, index) => (
                <StepEditor
                  index={index}
                  key={step.id}
                  onChange={(next) =>
                    setForm({
                      ...form,
                      steps: form.steps.map((row) =>
                        row.id === step.id ? next : row,
                      ),
                    })
                  }
                  onMove={(delta) =>
                    setForm({
                      ...form,
                      steps: moveStep(form.steps, index, delta),
                    })
                  }
                  onRemove={() =>
                    setForm({
                      ...form,
                      steps: form.steps.filter((row) => row.id !== step.id),
                    })
                  }
                  problems={problemsFor(step.id)}
                  step={step}
                  total={form.steps.length}
                />
              ))}
            </ul>
            <button
              className="flex w-fit items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-2xs font-medium hover:bg-accent"
              data-testid="add-step"
              onClick={() =>
                setForm({
                  ...form,
                  steps: [...form.steps, emptyStep(nextMockId("step"))],
                })
              }
              type="button"
            >
              <Plus aria-hidden className="size-3" />
              ステップを追加
            </button>
          </div>

          <label className="flex cursor-pointer items-center gap-2.5 border-t border-border pt-4">
            <input
              checked={form.enabled}
              className="size-4 shrink-0 accent-primary"
              data-testid="workflow-enabled"
              onChange={(event) =>
                setForm({ ...form, enabled: event.target.checked })
              }
              type="checkbox"
            />
            <span className="text-2xs font-medium">作成後すぐに動かす</span>
          </label>

          {formProblems.length > 0 && (
            <ul
              className="flex flex-col gap-0.5"
              data-testid="workflow-problems"
            >
              {formProblems.map((problem) => (
                <li
                  className="text-badge text-destructive"
                  key={problem.message}
                >
                  {problem.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Dialog>
  );
}
