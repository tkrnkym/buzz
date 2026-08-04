import { useId, useState } from "react";

import { Dialog } from "@/shared/ui/dialog";

export const FORM_FIELD_CLASS =
  "h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

export interface FormFieldSpec {
  name: string;
  label: string;
  placeholder?: string;
  /** A textarea rather than an input. For prose that runs past one line. */
  multiline?: boolean;
  required?: boolean;
  /** Seeded value, for an edit rather than a create. */
  initial?: string;
  /** Shown under the field. For a rule the reader cannot guess. */
  hint?: string;
}

/**
 * A dialog that is one short form.
 *
 * Six of these screens need the same thing — a few fields, a cancel, and a submit
 * that stays disabled until the required ones are filled. Writing that six times
 * produced six slightly different versions in the desktop client, which is how a
 * product ends up with two spellings of the same button.
 *
 * Only for genuinely simple forms. Anything with per-field validation, dependent
 * fields, or a repeating group gets its own component — the workflow builder is
 * the example, and squeezing it in here would have meant a `fields` array with an
 * escape hatch for everything.
 */
export function FormDialog({
  description,
  fields,
  onClose,
  onSubmit,
  submitLabel,
  testId,
  title,
}: {
  description?: string;
  fields: FormFieldSpec[];
  onClose: () => void;
  onSubmit: (values: Record<string, string>) => void;
  submitLabel: string;
  testId: string;
  title: string;
}) {
  const idPrefix = useId();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      fields.map((field) => [field.name, field.initial ?? ""]),
    ),
  );

  const complete = fields.every(
    (field) => !field.required || values[field.name]?.trim(),
  );

  return (
    <Dialog
      description={description}
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
            data-testid={`${testId}-submit`}
            disabled={!complete}
            onClick={() => onSubmit(values)}
            type="button"
          >
            {submitLabel}
          </button>
        </>
      }
      onClose={onClose}
      open
      testId={testId}
      title={title}
    >
      <div className="flex flex-col gap-3">
        {fields.map((field) => (
          // `htmlFor` rather than wrapping the control, because the control is
          // behind a conditional and a wrapping label cannot be statically shown
          // to contain one.
          <div className="flex flex-col gap-1" key={field.name}>
            <label
              className="text-2xs font-medium text-muted-foreground"
              htmlFor={`${idPrefix}-${field.name}`}
            >
              {field.label}
              {!field.required && "（任意）"}
            </label>
            {field.multiline ? (
              <textarea
                className="min-h-24 w-full resize-y rounded-md border border-border bg-background px-2.5 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                data-testid={`${testId}-${field.name}`}
                id={`${idPrefix}-${field.name}`}
                onChange={(event) =>
                  setValues({ ...values, [field.name]: event.target.value })
                }
                placeholder={field.placeholder}
                value={values[field.name] ?? ""}
              />
            ) : (
              <input
                className={FORM_FIELD_CLASS}
                data-testid={`${testId}-${field.name}`}
                id={`${idPrefix}-${field.name}`}
                onChange={(event) =>
                  setValues({ ...values, [field.name]: event.target.value })
                }
                placeholder={field.placeholder}
                value={values[field.name] ?? ""}
              />
            )}
            {field.hint && (
              <span className="text-badge text-muted-foreground">
                {field.hint}
              </span>
            )}
          </div>
        ))}
      </div>
    </Dialog>
  );
}
