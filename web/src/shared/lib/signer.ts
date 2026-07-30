/**
 * Signer port for the web client.
 *
 * Every write in Buzz is a signed Nostr event, so the client needs a signing
 * capability before it can do anything but read. Where that capability comes from
 * is a product decision that is still open (a browser-held key vs. an
 * SSO-authenticated remote signer), so the rest of the client depends on this
 * interface rather than on any one custody model.
 *
 * Implemented today:
 *
 * - {@link Nip07Signer} — a browser extension holds the key. Durable across
 *   reloads, needs no relay-side support.
 * - {@link EphemeralSigner} — a page-lifetime key, for read-only browsing of
 *   open relays. Deliberately *not* durable: a reload must not be able to orphan
 *   a relay-membership row against a key nobody can produce again.
 *
 * Extension points, both additive:
 *
 * - A NIP-46 remote signer (`bunker://` / `nostrconnect://`) — the natural fit
 *   for SSO, since the id_token authenticates a session with the signer service
 *   and no key material reaches the page. `crates/buzz-core/src/pairing/
 *   NIP-AB.md` already defines those payload types. Note that Buzz also needs
 *   `nip44_encrypt` / `nip44_decrypt` through the same channel: read state,
 *   channel sections, mutes, and reminders are all encrypted to self.
 * - A locally-held durable key (IndexedDB, passphrase- or passkey-wrapped).
 *
 * Both slot in by implementing {@link Signer}; no caller changes.
 */

import {
  type SignedNostrEvent,
  type UnsignedNostrEvent,
  canEncryptToSelf,
  getSigningPublicKey,
  hasNip07Provider,
  nip44DecryptFromSelf,
  nip44EncryptToSelf,
  signNostrEvent,
} from "@/shared/lib/nostr-signer";

/** Event fields a caller supplies; `created_at` is stamped at signing time. */
export type EventTemplate = Omit<UnsignedNostrEvent, "created_at"> & {
  created_at?: number;
};

/** How a signer holds its key. Surfaced in the UI so custody is never implicit. */
export type SignerKind = "nip07" | "ephemeral";

export interface Signer {
  readonly kind: SignerKind;
  /** Whether the identity survives a page reload. */
  readonly durable: boolean;
  /**
   * Whether NIP-44 encryption is available.
   *
   * Buzz keeps personal state (read positions, sections, mutes) on the relay as
   * ciphertext, so a signer without this cannot sync it. NIP-44 is *optional* in
   * NIP-07 and some extensions omit it, so this has to be feature-detected and
   * surfaced rather than assumed.
   */
  readonly canEncrypt: boolean;
  getPublicKey(): Promise<string>;
  sign(template: EventTemplate): Promise<SignedNostrEvent>;
  /** Encrypt to the signer's own key. Rejects when {@link canEncrypt} is false. */
  encryptToSelf(plaintext: string): Promise<string>;
  decryptFromSelf(ciphertext: string): Promise<string>;
}

class Nip07Signer implements Signer {
  readonly kind = "nip07" as const;
  readonly durable = true;
  readonly canEncrypt = canEncryptToSelf();

  getPublicKey(): Promise<string> {
    return getSigningPublicKey();
  }

  sign(template: EventTemplate): Promise<SignedNostrEvent> {
    return signNostrEvent(template, { requireNip07: true });
  }

  encryptToSelf(plaintext: string): Promise<string> {
    return nip44EncryptToSelf(plaintext);
  }

  decryptFromSelf(ciphertext: string): Promise<string> {
    return nip44DecryptFromSelf(ciphertext);
  }
}

class EphemeralSigner implements Signer {
  readonly kind = "ephemeral" as const;
  readonly durable = false;
  // The page holds the key itself, so encryption always works — though state
  // encrypted to a key that dies with the tab is only readable this session.
  readonly canEncrypt = true;

  getPublicKey(): Promise<string> {
    return getSigningPublicKey();
  }

  sign(template: EventTemplate): Promise<SignedNostrEvent> {
    return signNostrEvent(template);
  }

  encryptToSelf(plaintext: string): Promise<string> {
    return nip44EncryptToSelf(plaintext);
  }

  decryptFromSelf(ciphertext: string): Promise<string> {
    return nip44DecryptFromSelf(ciphertext);
  }
}

/**
 * The signer for this page load: the extension when one is installed, otherwise
 * a page-lifetime key.
 *
 * Resolved per call rather than cached, because an extension can be installed or
 * unlocked mid-session and the next write should pick it up.
 */
export function resolveSigner(): Signer {
  return hasNip07Provider() ? new Nip07Signer() : new EphemeralSigner();
}

export type { SignedNostrEvent, UnsignedNostrEvent };
