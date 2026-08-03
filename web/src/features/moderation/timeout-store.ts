/**
 * The reader's own community timeout, learned from a refused send.
 *
 * There is no proactive read: the relay tells a member they are blocked only when
 * they try to write. So this is written from a mutation's error path and read by
 * the composer with a live countdown — an imperative store plus
 * `useSyncExternalStore` is the smallest thing that serves both, and it stays out
 * of the React Query cache where an error is not a value.
 *
 * One value suffices. A timeout is applied at the community level and blocks
 * every channel's writes, so there is nothing to key by.
 */

import { useEffect, useState, useSyncExternalStore } from "react";

import {
  isTimeoutActive,
  parseTimeoutRejection,
} from "@/features/moderation/moderation-model";

export interface TimeoutState {
  /** True while the reader is write-blocked. */
  active: boolean;
  /** Expiry in epoch ms, or null when the relay gave no usable timestamp. */
  expiresAtMs: number | null;
}

const INACTIVE: TimeoutState = { active: false, expiresAtMs: null };

// Cached so `useSyncExternalStore` sees a stable reference between changes —
// returning a fresh object per read would re-render forever.
let snapshot: TimeoutState = INACTIVE;
const listeners = new Set<() => void>();

function emit(next: TimeoutState) {
  snapshot = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Inspect a relay rejection. Records the timeout and returns `true` when the
 * message was a timeout refusal, so the caller can suppress its generic error
 * surface; any other rejection returns `false` and is left alone.
 */
export function recordTimeoutFromRejection(
  message: string | null | undefined,
): boolean {
  const rejection = parseTimeoutRejection(message);
  if (!rejection) return false;
  emit({ active: true, expiresAtMs: rejection.expiresAtMs });
  return true;
}

/** Clear the block — called when a send is accepted. */
export function clearTimeoutState(): void {
  if (!snapshot.active && snapshot.expiresAtMs === null) return;
  emit(INACTIVE);
}

/** Read the state without subscribing, for use outside a render. */
export function getTimeoutSnapshot(): TimeoutState {
  return snapshot;
}

/** Reset the module between tests. */
export function resetTimeoutStateForTests(): void {
  snapshot = INACTIVE;
}

function currentState(state: TimeoutState, nowMs: number): TimeoutState {
  if (!state.active) return INACTIVE;
  // A known expiry that has passed collapses to inactive, so the composer
  // re-enables itself at the second the block ends rather than on the next send.
  if (!isTimeoutActive(state.expiresAtMs, nowMs)) return INACTIVE;
  return state;
}

/**
 * Subscribe to the timeout.
 *
 * Ticks once a second while a known-expiry block is running, which is what keeps
 * the countdown live and clears it exactly at expiry. An unknown expiry does not
 * tick: there is nothing to count down to, and a timer that only re-rendered the
 * same sentence would be pure cost.
 */
export function useTimeoutState(): TimeoutState {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const state = useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => INACTIVE,
  );

  useEffect(() => {
    if (!state.active || state.expiresAtMs === null) return;
    setNowMs(Date.now());
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [state.active, state.expiresAtMs]);

  return currentState(state, nowMs);
}
