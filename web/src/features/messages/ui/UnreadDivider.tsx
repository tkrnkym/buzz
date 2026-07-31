/**
 * The read/unread boundary, ported from the desktop client.
 *
 * Sits directly above the oldest unread top-level message, computed from the
 * read frontier as it stood when the channel was opened — see
 * `unread-marker.ts` for why the live cursor cannot be used.
 */
export function UnreadDivider({ unreadCount }: { unreadCount: number }) {
  const label =
    unreadCount === 1 ? "1 new message" : `${unreadCount} new messages`;
  return (
    <li
      aria-label={label}
      className="relative flex items-center py-1"
      data-testid="message-unread-divider"
    >
      <div aria-hidden className="h-px flex-1 bg-primary/40" />
      <span className="shrink-0 px-2 text-2xs font-semibold uppercase tracking-[0.04em] text-primary">
        New
      </span>
      <div aria-hidden className="h-px flex-1 bg-primary/40" />
    </li>
  );
}
