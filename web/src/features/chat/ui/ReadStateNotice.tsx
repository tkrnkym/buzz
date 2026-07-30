/**
 * Read-state sync status.
 *
 * Unread positions are stored on the relay encrypted to the reader's own key, so
 * a signer without NIP-44 cannot sync them at all. NIP-44 is optional in NIP-07
 * and some extensions omit it — without this notice, marking a channel read
 * would appear to work and then quietly not persist, which is worse than the
 * feature being visibly unavailable.
 */
export function ReadStateNotice({
  canSync,
  error,
}: {
  canSync: boolean;
  error: string | null;
}) {
  if (!canSync) {
    return (
      <span
        className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-badge font-medium text-secondary-foreground"
        title="Unread positions are stored on the relay encrypted to your own key. This signer does not support NIP-44 encryption, so they cannot be saved or read on another device."
      >
        unread sync off
      </span>
    );
  }

  if (error) {
    return (
      <span
        className="shrink-0 truncate text-2xs text-destructive"
        title={error}
      >
        Unread not saved
      </span>
    );
  }

  return null;
}
