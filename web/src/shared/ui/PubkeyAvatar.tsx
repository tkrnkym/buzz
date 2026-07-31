import type { ReactNode } from "react";

import { cn } from "@/shared/lib/cn";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";

/**
 * Stable hue from a hex pubkey, so one identity always draws the same colour.
 *
 * A recognition aid only. Two pubkeys can collide on a hue, which is exactly
 * why the tooltip carries the full key and the initials are never the thing a
 * reader is asked to trust.
 */
function pubkeyToHue(hex: string): number {
  let hash = 0;
  for (let index = 0; index < hex.length; index++) {
    hash = (hash * 31 + hex.charCodeAt(index)) | 0;
  }
  return Math.abs(hash) % 360;
}

/**
 * The identity disc.
 *
 * The single place allowed to slice a pubkey for display — the truncation guard
 * allowlists this line and nothing else, so every avatar in the app goes through
 * here and none of them invents its own shortening.
 */
export function PubkeyAvatar({
  badge,
  className,
  pubkey,
  size = "md",
}: {
  /** Overlay anchored to the bottom-right corner, e.g. a presence dot. */
  badge?: ReactNode;
  className?: string;
  pubkey: string;
  size?: "sm" | "md";
}) {
  const hue = pubkeyToHue(pubkey);
  // `text-badge` (0.625rem) is a rem token, so the initials scale with browser
  // zoom rather than freezing against it.
  const sizeClasses = size === "sm" ? "size-6 text-badge" : "size-8 text-xs";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="relative inline-flex shrink-0">
          <span
            className={cn(
              "flex items-center justify-center rounded-lg font-medium text-white",
              sizeClasses,
              className,
            )}
            style={{ backgroundColor: `hsl(${hue}, 55%, 45%)` }}
          >
            {pubkey.slice(0, 2)}
          </span>
          {badge}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <span className="font-mono text-xs">{pubkey}</span>
      </TooltipContent>
    </Tooltip>
  );
}
