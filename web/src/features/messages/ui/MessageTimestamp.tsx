import {
  formatFullDateTime,
  formatTime,
  formatTimeWithoutDayPeriod,
} from "@/features/messages/lib/date-formatters";
import { cn } from "@/shared/lib/cn";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";

/**
 * A message's clock time, with the full date on hover.
 *
 * `<time>` with a machine-readable `dateTime`, so the value is not only a
 * rendering: a screen reader and anything else parsing the page get the real
 * instant rather than a localized string.
 */
export function MessageTimestamp({
  className,
  createdAt,
  hideDayPeriod = false,
}: {
  className?: string;
  createdAt: number;
  /** Drops the AM/PM marker, for the narrow gutter of a continuation row. */
  hideDayPeriod?: boolean;
}) {
  const time = formatTime(createdAt);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <time
          className={cn(
            "shrink-0 cursor-default whitespace-nowrap text-2xs font-normal tabular-nums text-muted-foreground/60",
            className,
          )}
          dateTime={new Date(createdAt * 1_000).toISOString()}
        >
          {hideDayPeriod ? formatTimeWithoutDayPeriod(time) : time}
        </time>
      </TooltipTrigger>
      <TooltipContent side="top">
        {formatFullDateTime(createdAt)}
      </TooltipContent>
    </Tooltip>
  );
}
