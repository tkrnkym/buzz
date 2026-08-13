import {
  PROGRESS_STATUS,
  type ProgressStatus,
} from "@/shared/lib/progress-status";
import { cn } from "@/shared/lib/cn";

/**
 * A state, shown as colour *and* icon *and* word.
 *
 * A component rather than a class string, so there is no way to render one of
 * these as a bare coloured pill: the rule that colour is never the only carrier
 * is enforced by there being nothing else to call.
 */
export function ProgressBadge({
  className,
  count,
  status,
  testId,
}: {
  className?: string;
  /** How many are in this state, when more than one can be. */
  count?: number;
  status: ProgressStatus;
  testId?: string;
}) {
  const {
    Icon,
    className: statusClass,
    label,
    spins,
  } = PROGRESS_STATUS[status];

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-badge font-medium",
        statusClass,
        className,
      )}
      data-status={status}
      data-testid={testId}
    >
      <Icon aria-hidden className={cn("size-3", spins && "animate-spin")} />
      {label}
      {count !== undefined && <span>{count}</span>}
    </span>
  );
}
