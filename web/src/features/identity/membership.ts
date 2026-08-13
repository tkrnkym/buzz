/**
 * Two identifiers, because there are two things being identified.
 *
 * An **Account ID** is a person across the whole of Nuxx. A **Membership ID**
 * is that person *in one workspace* — their role there, their profile there,
 * and the key that signs on their behalf there. One person in three workspaces
 * has one account and three memberships, and those memberships can differ in
 * every respect except who is behind them.
 *
 * A pubkey is neither. It is how a signature is verified, and the migration
 * demotes it to exactly that: an internal attribute of a membership rather than
 * the thing the product refers to people by. Using it as the identifier was
 * workable while a client talked to one relay, and stops being workable the
 * moment the same person is two memberships with two keys — the UI would have
 * no way to say those are the same person, and every "is this you" check would
 * be answered per-relay.
 *
 * Existing events are not rewritten. They keep the pubkeys they were signed
 * with, and an index resolves those to memberships, so history stays valid and
 * verifiable while the product stops speaking in keys.
 */

export interface Membership {
  /** Stable within a workspace. What the product refers to people by. */
  id: string;
  /** The person, across every workspace. */
  accountId: string;
  workspaceId: string;
  role: string;
  displayName: string;
  /**
   * Signature verification only.
   *
   * Not an identifier: two memberships of the same account have different
   * pubkeys, and a membership can rotate its key without becoming someone else.
   */
  pubkey: string;
}

/**
 * Whether two memberships are the same person.
 *
 * By account, never by pubkey. A key rotation must not make someone a stranger,
 * and two workspaces' keys for one person must not read as two people.
 */
export function isSameAccount(left: Membership, right: Membership): boolean {
  return left.accountId === right.accountId;
}

/** Whether this membership is the reader's own, in this workspace. */
export function isSelf(
  membership: Membership,
  viewer: Membership | null,
): boolean {
  if (!viewer) return false;
  return membership.id === viewer.id;
}

/**
 * The memberships of one account, for "you are also in these workspaces".
 *
 * Sorted by workspace so the list is stable — a switcher that reorders itself
 * between renders is one people mis-click.
 */
export function membershipsOfAccount(
  memberships: Membership[],
  accountId: string,
): Membership[] {
  return memberships
    .filter((membership) => membership.accountId === accountId)
    .sort((left, right) => left.workspaceId.localeCompare(right.workspaceId));
}

/**
 * Resolve a signing key to the membership it belongs to.
 *
 * The index that lets old events keep their pubkeys. Returns `null` for a key
 * nobody in this workspace signs with, which is a real case — an event may have
 * been signed by someone who has since left — rather than an error.
 */
export function membershipForPubkey(
  memberships: Membership[],
  pubkey: string,
): Membership | null {
  const normalized = pubkey.trim().toLowerCase();
  return (
    memberships.find(
      (membership) => membership.pubkey.toLowerCase() === normalized,
    ) ?? null
  );
}

/**
 * How a membership is shown.
 *
 * The display name, never the key. A pubkey rendered where a name belongs is
 * how "who said this" became a hex string in the first place — and after the
 * migration it is not even the right hex string, since the same person's other
 * membership has a different one.
 */
export function membershipLabel(membership: Membership): string {
  return membership.displayName || membership.id;
}

/**
 * A membership id for a key that has no membership record here.
 *
 * There is always such a case: an event signed by someone who has since left,
 * or by a member of a workspace this client does not hold the roster for. The
 * migration says the product never shows a pubkey, and "never" has to cover
 * this one too — so a derived id stands in rather than the key falling through.
 *
 * Deterministic, so the same absent signer reads the same way twice, and
 * visibly a placeholder (`mem_`) so nobody mistakes it for a recorded id.
 *
 * The shape is this client's choice, not the spec's: §7 fixes that a Membership
 * ID is what the product refers to people by, and says nothing about its
 * format. Change it here and every surface follows.
 */
export function derivedMembershipId(pubkey: string): string {
  let hash = 0;
  const normalized = pubkey.trim().toLowerCase();
  for (let index = 0; index < normalized.length; index++) {
    hash = (hash * 31 + normalized.charCodeAt(index)) | 0;
  }
  return `mem_${Math.abs(hash).toString(36).padStart(7, "0").slice(0, 7)}`;
}

/**
 * The membership id to display for a signing key.
 *
 * The recorded one when this client knows it, a derived one otherwise. Never
 * the key — that is the whole point of the migration, and a fallback that
 * leaked hex would put it back on every screen showing an unknown signer.
 */
export function membershipIdForPubkey(
  memberships: Membership[],
  pubkey: string,
): string {
  return (
    membershipForPubkey(memberships, pubkey)?.id ?? derivedMembershipId(pubkey)
  );
}
