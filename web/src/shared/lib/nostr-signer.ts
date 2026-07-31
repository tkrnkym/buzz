import * as nip44 from "nostr-tools/nip44";
import {
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
} from "nostr-tools/pure";

export type UnsignedNostrEvent = {
  kind: number;
  created_at: number;
  tags: string[][];
  content: string;
};

export type SignedNostrEvent = UnsignedNostrEvent & {
  id: string;
  pubkey: string;
  sig: string;
};

type Nip07Provider = {
  getPublicKey(): Promise<string>;
  signEvent(event: UnsignedNostrEvent): Promise<SignedNostrEvent>;
  /**
   * NIP-44 encryption. Optional in NIP-07, and genuinely absent from some
   * extensions — callers must feature-detect rather than assume.
   */
  nip44?: {
    encrypt(peerPubkey: string, plaintext: string): Promise<string>;
    decrypt(peerPubkey: string, ciphertext: string): Promise<string>;
  };
};

declare global {
  interface Window {
    nostr?: Nip07Provider;
  }
}

export class Nip07UnavailableError extends Error {
  constructor() {
    super("A NIP-07 browser extension is required to join in the browser.");
    this.name = "Nip07UnavailableError";
  }
}

let ephemeralSecretKey: Uint8Array | null = null;

function getEphemeralSecretKey(): Uint8Array {
  if (!ephemeralSecretKey) {
    ephemeralSecretKey = generateSecretKey();
  }
  return ephemeralSecretKey;
}

export function hasNip07Provider(): boolean {
  return typeof window !== "undefined" && window.nostr != null;
}

/**
 * Public key {@link signNostrEvent} will sign with right now.
 *
 * Resolves the NIP-07 provider when one is installed, otherwise the
 * page-lifetime ephemeral key. Callers that need a durable identity must gate on
 * {@link hasNip07Provider} rather than treating this as stable across reloads.
 */
export async function getSigningPublicKey(): Promise<string> {
  const provider = typeof window === "undefined" ? undefined : window.nostr;
  if (provider) {
    return provider.getPublicKey();
  }
  return getPublicKey(getEphemeralSecretKey());
}

/** Whether the current signing path can perform NIP-44 encryption. */
export function canEncryptToSelf(): boolean {
  const provider = typeof window === "undefined" ? undefined : window.nostr;
  // With a provider, NIP-44 is only available if that provider implements it.
  // Without one, the page holds the key itself and can always encrypt.
  return provider ? provider.nip44 != null : true;
}

/**
 * NIP-44 encrypt to self — the conversation partner is the signer's own key.
 *
 * Nuxx stores personal state (read positions, channel sections, mutes) as
 * kind:30078 events on the relay, encrypted this way so the relay operator holds
 * ciphertext rather than a record of what each person has read.
 */
export async function nip44EncryptToSelf(plaintext: string): Promise<string> {
  const provider = typeof window === "undefined" ? undefined : window.nostr;
  if (provider) {
    if (!provider.nip44) {
      throw new Error("This browser extension does not support NIP-44.");
    }
    return provider.nip44.encrypt(await provider.getPublicKey(), plaintext);
  }
  const secretKey = getEphemeralSecretKey();
  return nip44.encrypt(
    plaintext,
    nip44.getConversationKey(secretKey, getPublicKey(secretKey)),
  );
}

/** Inverse of {@link nip44EncryptToSelf}. */
export async function nip44DecryptFromSelf(
  ciphertext: string,
): Promise<string> {
  const provider = typeof window === "undefined" ? undefined : window.nostr;
  if (provider) {
    if (!provider.nip44) {
      throw new Error("This browser extension does not support NIP-44.");
    }
    return provider.nip44.decrypt(await provider.getPublicKey(), ciphertext);
  }
  const secretKey = getEphemeralSecretKey();
  return nip44.decrypt(
    ciphertext,
    nip44.getConversationKey(secretKey, getPublicKey(secretKey)),
  );
}

function sameUnsignedEvent(
  expected: UnsignedNostrEvent,
  actual: SignedNostrEvent,
): boolean {
  return (
    actual.kind === expected.kind &&
    actual.created_at === expected.created_at &&
    actual.content === expected.content &&
    JSON.stringify(actual.tags) === JSON.stringify(expected.tags)
  );
}

/**
 * Sign with NIP-07 when available, otherwise use a page-lifetime key.
 *
 * The ephemeral fallback preserves anonymous browsing on open relays. Flows
 * that create durable membership must set `requireNip07` so a reload cannot
 * orphan a relay-membership row.
 */
export async function signNostrEvent(
  template: Omit<UnsignedNostrEvent, "created_at"> & {
    created_at?: number;
  },
  options?: { requireNip07?: boolean },
): Promise<SignedNostrEvent> {
  const unsigned: UnsignedNostrEvent = {
    ...template,
    created_at: template.created_at ?? Math.floor(Date.now() / 1000),
  };
  const provider = typeof window === "undefined" ? undefined : window.nostr;

  if (provider) {
    const expectedPubkey = await provider.getPublicKey();
    const signed = await provider.signEvent(unsigned);
    if (
      signed.pubkey !== expectedPubkey ||
      !sameUnsignedEvent(unsigned, signed) ||
      typeof signed.id !== "string" ||
      typeof signed.sig !== "string"
    ) {
      throw new Error("The NIP-07 extension returned an invalid signed event.");
    }
    return signed;
  }

  if (options?.requireNip07) {
    throw new Nip07UnavailableError();
  }

  const secretKey = getEphemeralSecretKey();
  const signed = finalizeEvent(unsigned, secretKey);
  if (signed.pubkey !== getPublicKey(secretKey)) {
    throw new Error("Failed to create the ephemeral browser identity.");
  }
  return signed;
}
