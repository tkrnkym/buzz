import { useState, type ReactNode } from "react";

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
 * Initials from a display name: one glyph per word, at most two.
 *
 * Falls back to the empty string, which the caller reads as "use the pubkey" —
 * a name of only punctuation should not produce a disc of punctuation.
 */
function initialsOf(label: string): string {
  const words = label
    .trim()
    .split(/\s+/)
    .map((word) => [...word][0])
    .filter(
      (glyph): glyph is string => Boolean(glyph) && /\p{L}|\p{N}/u.test(glyph),
    );
  return words.slice(0, 2).join("").toUpperCase();
}

/**
 * The identity disc.
 *
 * The single place allowed to slice a pubkey for display — the truncation guard
 * allowlists this line and nothing else, so every avatar in the app goes through
 * here and none of them invents its own shortening.
 *
 * A profile picture is used when there is one, and the coloured initials stand
 * in when there is not. A picture that fails to load falls back to the same
 * initials rather than leaving a broken-image box: kind:0 is self-asserted, so
 * the URL in it may be gone, wrong, or blocked.
 */
export function PubkeyAvatar({
  avatarUrl,
  badge,
  className,
  label,
  pubkey,
  size = "md",
}: {
  /** Profile picture, from kind:0 `picture`. */
  avatarUrl?: string | null;
  /** Overlay anchored to the bottom-right corner, e.g. a presence dot. */
  badge?: ReactNode;
  className?: string;
  /** Display name, for the initials and the tooltip. */
  label?: string | null;
  pubkey: string;
  size?: "sm" | "md";
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const hue = pubkeyToHue(pubkey);
  // `text-badge` (0.625rem) is a rem token, so the initials scale with browser
  // zoom rather than freezing against it.
  const sizeClasses = size === "sm" ? "size-6 text-badge" : "size-8 text-xs";
  const initials = (label ? initialsOf(label) : "") || pubkey.slice(0, 2);
  const showImage = Boolean(avatarUrl) && !imageFailed;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="relative inline-flex shrink-0">
          <span
            className={cn(
              "flex items-center justify-center overflow-hidden rounded-lg font-medium text-white",
              sizeClasses,
              className,
            )}
            style={
              showImage
                ? undefined
                : { backgroundColor: `hsl(${hue}, 55%, 45%)` }
            }
          >
            {showImage ? (
              <img
                alt=""
                className="size-full object-cover"
                draggable={false}
                onError={() => setImageFailed(true)}
                src={avatarUrl ?? undefined}
              />
            ) : (
              initials
            )}
          </span>
          {badge}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        {label ? (
          <span className="flex flex-col items-start">
            <span>{label}</span>
            <span className="font-mono text-2xs opacity-70">{pubkey}</span>
          </span>
        ) : (
          <span className="font-mono text-xs">{pubkey}</span>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
