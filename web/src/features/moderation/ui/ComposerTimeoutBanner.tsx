import { Clock } from "lucide-react";

import { formatTimeoutRemaining } from "@/features/moderation/moderation-model";

/**
 * The banner above the composer while the reader is timed out.
 *
 * Purely presentational — the state and its per-second tick belong to
 * `useTimeoutState`. Shows a countdown when the expiry is known and states the
 * block plainly when it is not, rather than inventing a duration: "you are
 * blocked" is useful, and a made-up clock is worse than no clock.
 */
export function ComposerTimeoutBanner({
  expiresAtMs,
}: {
  expiresAtMs: number | null;
}) {
  const remaining = formatTimeoutRemaining(expiresAtMs);

  return (
    <div
      className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/15 px-3 py-2 text-2xs"
      data-testid="composer-timeout-banner"
    >
      <Clock aria-hidden className="size-3.5 shrink-0 text-amber-600" />
      <span className="min-w-0">
        {remaining
          ? `モデレーターによってタイムアウト中です — 残り${remaining}。`
          : "モデレーターによってタイムアウト中です。"}
      </span>
    </div>
  );
}
