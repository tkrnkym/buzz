/**
 * Persistent, authenticated relay session for the browser.
 *
 * `shared/lib/nostr-client.ts` opens a socket per query, which suits the invite
 * and repo pages. A chat client needs the opposite shape: one long-lived socket
 * that stays authenticated, carries many live subscriptions, survives network
 * blips, and re-subscribes on reconnect.
 *
 * Protocol handled here (NIP-01 + NIP-42):
 *
 *   open → relay sends ["AUTH", challenge] → sign kind:22242 and reply
 *        → relay OKs the auth event → flush REQs and queued EVENTs
 *
 * Buzz relays always challenge, but the session tolerates relays that do not: if
 * no challenge arrives within a short grace window it proceeds unauthenticated,
 * so open relays still work.
 *
 * Deliberately *not* here yet: stall watchdog, rate-limit gate, prioritized
 * reconnect-replay ordering, and CLOSED-driven recovery policy. The desktop
 * client had all four as pure TypeScript; it has since been removed, so they
 * are recoverable from git history (`desktop/src/shared/api/relay*.ts` before
 * the client was deleted) rather than from the tree.
 */

import { makeAuthEvent } from "nostr-tools/nip42";

import type { NostrEvent, NostrFilter } from "@/shared/lib/nostr-client";
import type { EventTemplate, Signer } from "@/shared/lib/signer";

export type RelayConnectionState =
  | "idle"
  | "connecting"
  | "authenticating"
  | "ready"
  | "reconnecting"
  | "closed";

/**
 * The slice of `WebSocket` the session uses.
 *
 * Narrowing to this interface is what makes the session testable without a
 * browser or a live relay — see `relay-session.test.mjs`.
 */
export interface RelaySocket {
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onmessage: ((data: string) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
}

export type RelaySocketFactory = (url: string) => RelaySocket;

export interface SubscriptionHandlers {
  onEvent(event: NostrEvent): void;
  /** Stored events for this filter are all delivered; the tail is now live. */
  onEose?(): void;
  /** The relay refused or terminated the subscription. */
  onClosed?(reason: string): void;
}

export interface RelaySessionOptions {
  url: string;
  signer: Signer;
  socketFactory?: RelaySocketFactory;
  /** First reconnect delay; doubles per attempt up to `backoffMaxMs`. */
  backoffBaseMs?: number;
  backoffMaxMs?: number;
  /** How long to wait for an AUTH challenge before proceeding unauthenticated. */
  authGraceMs?: number;
  /** Injectable for deterministic backoff in tests. */
  random?: () => number;
  /** Diagnostics sink; defaults to `console.warn`. */
  onWarning?: (message: string, detail?: unknown) => void;
}

interface ActiveSubscription {
  filter: NostrFilter;
  handlers: SubscriptionHandlers;
}

interface PendingPublish {
  event: NostrEvent;
  resolve: () => void;
  reject: (error: Error) => void;
  sent: boolean;
}

/** Wrap the browser `WebSocket` as a {@link RelaySocket}. */
export function browserSocketFactory(url: string): RelaySocket {
  const ws = new WebSocket(url);
  const socket: RelaySocket = {
    send: (data) => ws.send(data),
    close: () => ws.close(),
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
  };
  ws.addEventListener("open", () => socket.onopen?.());
  ws.addEventListener("message", (event) =>
    socket.onmessage?.(String(event.data)),
  );
  ws.addEventListener("close", () => socket.onclose?.());
  ws.addEventListener("error", () => socket.onerror?.());
  return socket;
}

export class RelaySession {
  private readonly url: string;
  private readonly signer: Signer;
  private readonly socketFactory: RelaySocketFactory;
  private readonly backoffBaseMs: number;
  private readonly backoffMaxMs: number;
  private readonly authGraceMs: number;
  private readonly random: () => number;
  private readonly warn: (message: string, detail?: unknown) => void;

  private socket: RelaySocket | null = null;
  private state: RelayConnectionState = "idle";
  private readonly stateListeners = new Set<
    (state: RelayConnectionState) => void
  >();

  private readonly subscriptions = new Map<string, ActiveSubscription>();
  private readonly publishes = new Map<string, PendingPublish>();

  private authEventId: string | null = null;
  private authGraceTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private closedByCaller = false;
  private nextSubscriptionId = 0;

  constructor(options: RelaySessionOptions) {
    this.url = options.url;
    this.signer = options.signer;
    this.socketFactory = options.socketFactory ?? browserSocketFactory;
    this.backoffBaseMs = options.backoffBaseMs ?? 500;
    this.backoffMaxMs = options.backoffMaxMs ?? 30_000;
    this.authGraceMs = options.authGraceMs ?? 100;
    this.random = options.random ?? Math.random;
    this.warn =
      options.onWarning ??
      ((message, detail) => console.warn(`[relay] ${message}`, detail));
  }

  getState(): RelayConnectionState {
    return this.state;
  }

  onStateChange(listener: (state: RelayConnectionState) => void): () => void {
    this.stateListeners.add(listener);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  /** Open the socket. Idempotent while a connection is live or pending. */
  connect(): void {
    if (this.socket || this.state === "connecting") {
      return;
    }
    this.closedByCaller = false;
    this.setState(this.reconnectAttempts === 0 ? "connecting" : "reconnecting");

    const socket = this.socketFactory(this.url);
    this.socket = socket;

    socket.onopen = () => {
      if (this.socket !== socket) return;
      this.setState("authenticating");
      // Buzz always challenges; other relays may not. Don't stall forever.
      this.authGraceTimer = setTimeout(() => {
        this.authGraceTimer = null;
        if (this.socket === socket && this.state === "authenticating") {
          this.becomeReady();
        }
      }, this.authGraceMs);
    };

    socket.onmessage = (data) => {
      if (this.socket !== socket) return;
      void this.handleMessage(data);
    };

    socket.onclose = () => {
      if (this.socket !== socket) return;
      this.handleDisconnect();
    };

    // `onclose` always follows an error, and that is where reconnect is driven.
    socket.onerror = null;
  }

  /**
   * Close for good: no reconnect, pending publishes rejected, subscriptions
   * dropped. Call on community switch or teardown.
   */
  close(): void {
    this.closedByCaller = true;
    this.clearTimers();
    this.subscriptions.clear();
    this.failPendingPublishes(new Error("Relay session closed"));
    const socket = this.socket;
    this.socket = null;
    if (socket) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onclose = null;
      socket.onerror = null;
      try {
        socket.close();
      } catch {
        // Already closing; nothing to recover.
      }
    }
    this.setState("closed");
  }

  /**
   * Open a subscription. Stored events arrive first, then `onEose`, then the live
   * tail. Re-sent automatically after a reconnect, so `onEvent` must tolerate a
   * repeated event id — the caller dedupes.
   */
  subscribe(filter: NostrFilter, handlers: SubscriptionHandlers): () => void {
    const subId = `s${this.nextSubscriptionId++}`;
    this.subscriptions.set(subId, { filter, handlers });
    if (this.state === "ready") {
      this.sendRaw(["REQ", subId, filter]);
    } else {
      this.connect();
    }
    return () => {
      if (!this.subscriptions.delete(subId)) {
        return;
      }
      if (this.state === "ready") {
        this.sendRaw(["CLOSE", subId]);
      }
    };
  }

  /**
   * One-shot read: collect stored events for `filter` up to EOSE.
   *
   * Runs on the authenticated session rather than opening its own socket, so a
   * read costs no extra connection or AUTH round-trip.
   */
  query(filter: NostrFilter, timeoutMs = 10_000): Promise<NostrEvent[]> {
    return new Promise((resolve, reject) => {
      const events: NostrEvent[] = [];
      let settled = false;
      let unsubscribe: (() => void) | null = null;

      const finish = (complete: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        unsubscribe?.();
        complete();
      };

      const timer = setTimeout(() => {
        finish(() =>
          reject(new Error(`Relay query timed out after ${timeoutMs}ms`)),
        );
      }, timeoutMs);

      unsubscribe = this.subscribe(filter, {
        onEvent: (event) => events.push(event),
        onEose: () => finish(() => resolve(events)),
        onClosed: (reason) => finish(() => reject(new Error(reason))),
      });
    });
  }

  /**
   * Sign and publish an event, resolving when the relay OKs it.
   *
   * Queued while the session is not ready, so a send during a reconnect is
   * delivered rather than dropped.
   */
  async publish(template: EventTemplate): Promise<NostrEvent> {
    const event = await this.signer.sign(template);
    return new Promise<NostrEvent>((resolve, reject) => {
      this.publishes.set(event.id, {
        event,
        resolve: () => resolve(event),
        reject,
        sent: false,
      });
      if (this.state === "ready") {
        this.flushPublishes();
      } else {
        this.connect();
      }
    });
  }

  private setState(state: RelayConnectionState): void {
    if (this.state === state) return;
    this.state = state;
    for (const listener of this.stateListeners) {
      listener(state);
    }
  }

  private becomeReady(): void {
    this.reconnectAttempts = 0;
    this.setState("ready");
    for (const [subId, sub] of this.subscriptions) {
      this.sendRaw(["REQ", subId, sub.filter]);
    }
    this.flushPublishes();
  }

  private flushPublishes(): void {
    for (const pending of this.publishes.values()) {
      if (!pending.sent) {
        pending.sent = true;
        this.sendRaw(["EVENT", pending.event]);
      }
    }
  }

  private async handleMessage(raw: string): Promise<void> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    if (!Array.isArray(parsed)) return;

    const type = parsed[0];

    if (type === "AUTH" && typeof parsed[1] === "string") {
      await this.respondToAuthChallenge(parsed[1]);
      return;
    }

    if (type === "OK" && typeof parsed[1] === "string") {
      this.handleOk(parsed[1], parsed[2] === true, parsed[3]);
      return;
    }

    if (type === "EVENT" && typeof parsed[1] === "string" && parsed[2]) {
      this.subscriptions
        .get(parsed[1])
        ?.handlers.onEvent(parsed[2] as NostrEvent);
      return;
    }

    if (type === "EOSE" && typeof parsed[1] === "string") {
      this.subscriptions.get(parsed[1])?.handlers.onEose?.();
      return;
    }

    if (type === "CLOSED" && typeof parsed[1] === "string") {
      const subId = parsed[1];
      const reason =
        typeof parsed[2] === "string"
          ? parsed[2]
          : "subscription closed by relay";
      const sub = this.subscriptions.get(subId);
      // The relay will not resume this subscription, so drop it rather than
      // replaying on reconnect a filter the relay has already refused.
      this.subscriptions.delete(subId);
      sub?.handlers.onClosed?.(reason);
    }
  }

  private async respondToAuthChallenge(challenge: string): Promise<void> {
    if (this.authGraceTimer) {
      clearTimeout(this.authGraceTimer);
      this.authGraceTimer = null;
    }
    try {
      const signed = await this.signer.sign(makeAuthEvent(this.url, challenge));
      this.authEventId = signed.id;
      this.sendRaw(["AUTH", signed]);
    } catch (error) {
      // Signing failed (no extension, or the user declined). Retrying would
      // hot-loop on a decision the relay cannot change, so proceed
      // unauthenticated: reads on open relays still work, and anything the relay
      // gates surfaces as a CLOSED reason on the affected subscription.
      this.warn("AUTH signing failed; continuing unauthenticated", error);
      this.becomeReady();
    }
  }

  private handleOk(eventId: string, accepted: boolean, message: unknown): void {
    if (eventId === this.authEventId) {
      this.authEventId = null;
      if (!accepted) {
        // Reconnecting cannot help until whatever the relay objected to changes,
        // so stay up unauthenticated and let subscription CLOSED reasons carry
        // the detail to the UI.
        this.warn("relay rejected AUTH", message);
      }
      this.becomeReady();
      return;
    }

    const pending = this.publishes.get(eventId);
    if (!pending) return;
    this.publishes.delete(eventId);
    if (accepted) {
      pending.resolve();
    } else {
      pending.reject(
        new Error(
          typeof message === "string" && message
            ? message
            : "Relay rejected the event",
        ),
      );
    }
  }

  private handleDisconnect(): void {
    this.socket = null;
    if (this.authGraceTimer) {
      clearTimeout(this.authGraceTimer);
      this.authGraceTimer = null;
    }
    this.authEventId = null;
    // Unsent publishes stay queued for the next ready state; sent-but-unacked
    // ones lost their OK with the socket, so surface them instead of hanging.
    for (const [eventId, pending] of [...this.publishes]) {
      if (pending.sent) {
        this.publishes.delete(eventId);
        pending.reject(new Error("Connection lost before the relay confirmed"));
      }
    }

    if (this.closedByCaller) {
      this.setState("closed");
      return;
    }

    this.setState("reconnecting");
    const delay = this.nextBackoffDelay();
    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  /** Exponential backoff with full jitter, so a relay restart isn't stampeded. */
  private nextBackoffDelay(): number {
    const ceiling = Math.min(
      this.backoffMaxMs,
      this.backoffBaseMs * 2 ** this.reconnectAttempts,
    );
    return Math.round(ceiling * this.random());
  }

  private sendRaw(message: unknown[]): void {
    try {
      this.socket?.send(JSON.stringify(message));
    } catch (error) {
      this.warn("send failed", error);
    }
  }

  private clearTimers(): void {
    if (this.authGraceTimer) {
      clearTimeout(this.authGraceTimer);
      this.authGraceTimer = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private failPendingPublishes(error: Error): void {
    for (const pending of this.publishes.values()) {
      pending.reject(error);
    }
    this.publishes.clear();
  }
}
