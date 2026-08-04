import { ChevronDown } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/shared/lib/cn";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";

/**
 * The form language the desktop client used, which this client could not express.
 *
 * Two shapes. A **field shell** is a bordered container a text control sits
 * inside, so the box is the field rather than the input being the box — that is
 * what lets a textarea and a single-line input look like the same control at
 * different heights. A **value row** is the same box used for a choice: the
 * question on the left, the current answer and a chevron on the right, opening a
 * menu of the alternatives.
 *
 * The value row is not a styled `<select>`. A native select cannot carry an icon
 * per option, cannot show the chosen value in the row's own typography, and looks
 * like a different control on every platform — which is why the original used an
 * anchored menu, and why this needed `dropdown-menu.tsx` to exist first.
 */

/** Matches the desktop client's `CHANNEL_FORM_FIELD_SHELL_CLASS`. */
export const FIELD_SHELL_CLASS =
  "rounded-xl border border-input bg-muted/40 transition-colors duration-150 ease-out hover:border-muted-foreground/40 focus-within:border-muted-foreground/50";

/** For the control *inside* a shell: no border of its own, no ring. */
export const FIELD_CONTROL_CLASS =
  "w-full border-0 bg-transparent text-sm text-foreground shadow-none outline-none ring-0 placeholder:text-muted-foreground/55 focus:outline-none focus-visible:ring-0";

export function FieldShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn(FIELD_SHELL_CLASS, className)}>{children}</div>;
}

/** A labelled field: the label, then the shell holding the control. */
export function Field({
  children,
  htmlFor,
  label,
  optional,
}: {
  children: ReactNode;
  htmlFor?: string;
  label: string;
  optional?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-foreground" htmlFor={htmlFor}>
        {label}
        {optional && (
          <span className="ml-1 text-xs font-normal text-muted-foreground/50">
            Optional
          </span>
        )}
      </label>
      <FieldShell>{children}</FieldShell>
    </div>
  );
}

export type ValueOption<T extends string> = {
  value: T;
  label: string;
  /** Shown before the label, in the row and in the menu. */
  icon?: LucideIcon;
  /** A second line in the menu, for a choice that needs explaining. */
  hint?: string;
};

/**
 * A bordered row carrying a choice: label left, current value and chevron right.
 *
 * The menu is width-matched to the row via
 * `--radix-dropdown-menu-trigger-width`, so it reads as the row expanding rather
 * than as a popup arriving from somewhere else.
 */
/**
 * The choice control on its own: current value, chevron, and an anchored menu.
 *
 * Split out of {@link ValueRow} because the settings screens need the same picker
 * without the row — there the label and its explanation are already the left half of
 * a `SettingRow`, and nesting a labelled row inside a labelled row prints the
 * question twice.
 *
 * The menu is width-matched to the trigger via
 * `--radix-dropdown-menu-trigger-width`, so it reads as the control expanding rather
 * than as a popup arriving from somewhere else.
 */
export function ValuePicker<T extends string>({
  ariaLabel,
  disabled,
  onChange,
  options,
  testId,
  value,
}: {
  ariaLabel: string;
  disabled?: boolean;
  onChange: (value: T) => void;
  options: ReadonlyArray<ValueOption<T>>;
  testId?: string;
  value: T;
}) {
  const selected = options.find((option) => option.value === value);
  const Icon = selected?.icon;

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        aria-label={`${ariaLabel}: ${selected?.label ?? value}`}
        className="flex h-9 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
        data-testid={testId}
        disabled={disabled}
        type="button"
      >
        {Icon && <Icon aria-hidden className="size-4" />}
        {selected?.label ?? value}
        <ChevronDown aria-hidden className="size-4 text-muted-foreground/70" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        // Returning focus to the trigger reopens nothing, but it does scroll the
        // dialog back to this row on a narrow window. The row is already where the
        // reader is looking.
        onCloseAutoFocus={(event) => event.preventDefault()}
        style={{ minWidth: "var(--radix-dropdown-menu-trigger-width)" }}
      >
        <DropdownMenuRadioGroup
          onValueChange={(next) => onChange(next as T)}
          value={value}
        >
          {options.map((option) => {
            const OptionIcon = option.icon;
            return (
              <DropdownMenuRadioItem
                className={option.hint ? "items-start py-2" : undefined}
                data-testid={testId ? `${testId}-${option.value}` : undefined}
                key={option.value}
                value={option.value}
              >
                {OptionIcon && (
                  <OptionIcon
                    aria-hidden
                    className={cn("size-4", option.hint && "mt-0.5")}
                  />
                )}
                <span className="flex flex-col gap-0.5">
                  <span>{option.label}</span>
                  {option.hint && (
                    <span className="text-2xs text-muted-foreground">
                      {option.hint}
                    </span>
                  )}
                </span>
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** A bordered row carrying a choice: label left, current value and chevron right. */
export function ValueRow<T extends string>({
  disabled,
  label,
  onChange,
  options,
  testId,
  value,
}: {
  disabled?: boolean;
  label: string;
  onChange: (value: T) => void;
  options: ReadonlyArray<ValueOption<T>>;
  testId?: string;
  value: T;
}) {
  return (
    <FieldShell className="flex min-h-12 items-center justify-between gap-3 pl-3 pr-1.5">
      <span className="text-sm font-medium text-foreground">{label}</span>
      <ValuePicker<T>
        ariaLabel={label}
        {...(disabled === undefined ? {} : { disabled })}
        onChange={onChange}
        options={options}
        {...(testId === undefined ? {} : { testId })}
        value={value}
      />
    </FieldShell>
  );
}
