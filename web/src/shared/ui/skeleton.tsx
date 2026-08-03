import type { HTMLAttributes } from "react";

import { cn } from "@/shared/lib/cn";

/**
 * Placeholder bar for content that has not arrived.
 *
 * `aria-hidden` because a skeleton is a visual stand-in: a screen reader should
 * hear the eventual content or a live-region status, never a row of empty divs.
 */
export function Skeleton({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "rounded-md bg-primary/10 motion-safe:animate-pulse",
        className,
      )}
      {...props}
    />
  );
}
