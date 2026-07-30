import { useRelayConnectionState } from "@/shared/api/relay-provider";
import { resolveSigner } from "@/shared/lib/signer";
import { cn } from "@/shared/lib/cn";

const STATE_LABEL: Record<string, string> = {
  idle: "Idle",
  connecting: "Connecting…",
  authenticating: "Authenticating…",
  ready: "Connected",
  reconnecting: "Reconnecting…",
  closed: "Disconnected",
};

/**
 * Connection and identity indicator.
 *
 * Identity custody is shown, not implied: an ephemeral page-lifetime key cannot
 * be recovered after a reload, so a reader must be able to tell that the identity
 * they are posting under is disposable.
 */
export function RelayStatus() {
  const state = useRelayConnectionState();
  const signer = resolveSigner();

  return (
    <div className="flex shrink-0 items-center gap-2 text-2xs text-muted-foreground">
      {/* Deliberately avoids the `status-*` / `warning` utilities: both Tailwind
          configs map them to `--status-*` / `--ui-warning*`, which no stylesheet
          in this repo defines, so those classes render colorless. */}
      <span
        aria-hidden
        className={cn(
          "size-2 rounded-full",
          state === "ready"
            ? "bg-primary"
            : state === "closed"
              ? "bg-destructive"
              : "bg-muted-foreground",
        )}
      />
      <span>{STATE_LABEL[state] ?? state}</span>
      {!signer.durable && (
        <span
          className="rounded bg-secondary px-1.5 py-0.5 text-badge font-medium text-secondary-foreground"
          title="This browser has no NIP-07 extension, so the key lives only for this page load. Reloading loses it."
        >
          temporary identity
        </span>
      )}
    </div>
  );
}
