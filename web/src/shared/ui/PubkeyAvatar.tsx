import { useState, type ReactNode } from "react";

import { derivedMembershipId } from "@/features/identity/membership";
import { cn } from "@/shared/lib/cn";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";

/**
 * Stable hue from the signing key, so one identity always draws the same colour.
 *
 * A recognition aid only. Two keys can collide on a hue, which is why the
 * tooltip carries the membership id and the initials are never the thing a
 * reader is asked to trust. The key is used here and nowhere visible — a colour
 * is not an identifier, so this stays within §7's "verification attribute".
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
 * Falls back to the empty string, which the caller reads as "use the membership
 * id" — a name of only punctuation should not produce a disc of punctuation.
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
 * Nothing here shows a pubkey. It used to: the tooltip carried the full key and
 * the initials fell back to its first two characters, which put hex on every
 * avatar in the app. Both now read the membership id, which is what §7 makes
 * the identifier — the key stays only as the seed for the colour.
 *
 * A profile picture is used when there is one, and the coloured initials stand
 * in when there is not. A picture that fails to load falls back to the same
 * initials rather than leaving a broken-image box: kind:0 is self-asserted, so
 * the URL in it may be gone, wrong, or blocked.
 */
const SIZE_CLASSES = {
  // Every size is a rem token, so the initials scale with browser zoom rather
  // than freezing against it.
  sm: "size-6 text-badge",
  md: "size-8 text-xs",
  // The card portrait: an agent or a person shown as a subject rather than as a
  // row's leading glyph.
  xl: "size-24 text-2xl",
} as const;

export function PubkeyAvatar({
  avatarUrl,
  badge,
  className,
  label,
  membershipId,
  pubkey,
  shape = "square",
  size = "md",
}: {
  /** Profile picture, from kind:0 `picture`. */
  avatarUrl?: string | null;
  /** Overlay anchored to the bottom-right corner, e.g. a presence dot. */
  badge?: ReactNode;
  className?: string;
  /** Display name, for the initials and the tooltip. */
  label?: string | null;
  /**
   * The recorded membership id, where the caller knows it.
   *
   * Derived from the key when absent — the two must not be allowed to disagree,
   * so a caller that has the real one passes it rather than letting the fallback
   * invent a different string for the same person.
   */
  membershipId?: string | null;
  /**
   * Signature-verification attribute, kept because it is what makes the colour
   * stable per identity. Not shown, and not the identifier — see §7.
   */
  pubkey: string;
  /**
   * `square` is the rounded-rectangle disc used in rows and headers. `circle` is
   * for the card portrait, where the subject is the avatar itself.
   */
  shape?: "square" | "circle";
  size?: "sm" | "md" | "xl";
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const hue = pubkeyToHue(pubkey);
  const sizeClasses = SIZE_CLASSES[size];
  const identity = membershipId ?? derivedMembershipId(pubkey);
  // Sliced from the membership id, not the key: two hex characters in a disc is
  // still hex on screen, and it was on every avatar without a resolved name.
  const initials =
    (label ? initialsOf(label) : "") || identity.slice(-2).toUpperCase();
  const showImage = Boolean(avatarUrl) && !imageFailed;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="relative inline-flex shrink-0">
          <span
            className={cn(
              "flex items-center justify-center overflow-hidden font-medium text-white",
              shape === "circle" ? "rounded-full" : "rounded-lg",
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
        {/* The membership id, never the signing key. This tooltip is on every
            avatar in the app, so it was the single largest hex surface there
            was — and after §7 the key is not the identifier anyway: the same
            person's other membership signs with a different one. */}
        {label ? (
          <span className="flex flex-col items-start">
            <span>{label}</span>
            <span className="font-mono text-2xs opacity-70">{identity}</span>
          </span>
        ) : (
          <span className="font-mono text-xs">{identity}</span>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
