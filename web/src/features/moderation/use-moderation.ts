import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import { useMyPubkey } from "@/features/chat/use-chat";
import { useCanModerate } from "@/features/directory/use-directory";
import {
  fetchModerationAudit,
  fetchModerationReports,
  fetchModerationRestricted,
} from "@/features/moderation/moderation-api";
import {
  buildBanTemplate,
  buildMuteListTemplate,
  buildReportTemplate,
  buildResolveReportTemplate,
  buildTimeoutTemplate,
  buildUnbanTemplate,
  buildUntimeoutTemplate,
  mutedPubkeysFromEvent,
  toggleMuted,
  type ReportType,
  type ResolutionAction,
} from "@/features/moderation/moderation-model";
import { normalizePubkey } from "@/features/profile/profile-model";
import { useRelaySession } from "@/shared/api/relay-provider";
import { postRelayQuery } from "@/shared/api/relay-http";
import { KIND_MUTE_LIST } from "@/shared/constants/kinds";

const REPORTS_KEY = ["moderation", "reports"] as const;
const AUDIT_KEY = ["moderation", "audit"] as const;
const RESTRICTED_KEY = ["moderation", "restricted"] as const;
const MUTE_KEY = ["moderation", "mute-list"] as const;

/**
 * Who is currently banned or timed out.
 *
 * Gated on the reader being a moderator so a member's client never issues a
 * request it knows will come back 403. The gate is an affordance, not the
 * enforcement — the relay decides.
 */
export function useRestrictions() {
  const canModerate = useCanModerate();
  return useQuery({
    enabled: canModerate,
    queryKey: RESTRICTED_KEY,
    queryFn: fetchModerationRestricted,
    staleTime: 15_000,
  });
}

export function useModerationReports(options?: {
  status?: string;
  limit?: number;
}) {
  const canModerate = useCanModerate();
  return useQuery({
    enabled: canModerate,
    queryKey: [...REPORTS_KEY, options?.status ?? null, options?.limit ?? null],
    queryFn: () => fetchModerationReports(options),
    staleTime: 15_000,
  });
}

export function useModerationAudit(limit?: number) {
  const canModerate = useCanModerate();
  return useQuery({
    enabled: canModerate,
    queryKey: [...AUDIT_KEY, limit ?? null],
    queryFn: () => fetchModerationAudit(limit),
    staleTime: 15_000,
  });
}

/**
 * Refresh every moderator read after a command.
 *
 * A command's effect appears only once the relay has processed it, so this
 * invalidates rather than writing an optimistic row — a ban that the relay
 * refused must not leave a phantom entry in the restricted list.
 */
function useInvalidateModerationReads() {
  const queryClient = useQueryClient();
  return useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: REPORTS_KEY }),
        queryClient.invalidateQueries({ queryKey: AUDIT_KEY }),
        queryClient.invalidateQueries({ queryKey: RESTRICTED_KEY }),
      ]),
    [queryClient],
  );
}

/** Submit a NIP-56 report. Available to any member, unlike everything below. */
export function useSubmitReport() {
  const session = useRelaySession();
  return useMutation({
    mutationFn: (input: {
      authorPubkey: string;
      eventId: string;
      reportType: ReportType;
      note?: string;
    }) => session.publish(buildReportTemplate(input)),
  });
}

export function useBanMember() {
  const session = useRelaySession();
  const invalidate = useInvalidateModerationReads();
  return useMutation({
    mutationFn: (input: {
      pubkey: string;
      expiresAt?: number;
      reason?: string;
    }) => session.publish(buildBanTemplate(input)),
    onSuccess: invalidate,
  });
}

export function useUnbanMember() {
  const session = useRelaySession();
  const invalidate = useInvalidateModerationReads();
  return useMutation({
    mutationFn: (pubkey: string) => session.publish(buildUnbanTemplate(pubkey)),
    onSuccess: invalidate,
  });
}

export function useTimeoutMember() {
  const session = useRelaySession();
  const invalidate = useInvalidateModerationReads();
  return useMutation({
    mutationFn: (input: {
      pubkey: string;
      expiresAt: number;
      reason?: string;
    }) => session.publish(buildTimeoutTemplate(input)),
    onSuccess: invalidate,
  });
}

export function useUntimeoutMember() {
  const session = useRelaySession();
  const invalidate = useInvalidateModerationReads();
  return useMutation({
    mutationFn: (pubkey: string) =>
      session.publish(buildUntimeoutTemplate(pubkey)),
    onSuccess: invalidate,
  });
}

export function useResolveReport() {
  const session = useRelaySession();
  const invalidate = useInvalidateModerationReads();
  return useMutation({
    mutationFn: (input: {
      reportEventId: string;
      action: ResolutionAction;
      reason?: string;
    }) => session.publish(buildResolveReportTemplate(input)),
    onSuccess: invalidate,
  });
}

const EMPTY_MUTED: string[] = [];

/**
 * The reader's own mute list (NIP-51, kind 10000).
 *
 * Read with the reader as the only author: a mute list is personal, and a filter
 * that omitted the author would return everyone else's.
 *
 * The returned `Set` is memoized on the query's array, not rebuilt per render.
 * A fresh `Set` each time would give the chat timeline a new filtered row array
 * on every render, which is precisely what defeats `React.memo` on the rows.
 */
export function useMuteList(): Set<string> {
  const myPubkey = useMyPubkey();
  const query = useQuery({
    enabled: myPubkey !== null,
    queryKey: [...MUTE_KEY, myPubkey],
    queryFn: async () => {
      const events = await postRelayQuery([
        { kinds: [KIND_MUTE_LIST], authors: [myPubkey as string], limit: 1 },
      ]);
      // Newest wins: kind 10000 is replaceable, but a relay may still hold an
      // older copy, and sorting here costs nothing.
      const newest = events.sort((a, b) => b.created_at - a.created_at)[0];
      return [...mutedPubkeysFromEvent(newest)];
    },
    staleTime: 60_000,
  });
  const data = query.data ?? EMPTY_MUTED;
  return useMemo(() => new Set(data), [data]);
}

/**
 * Mute or unmute someone.
 *
 * Publishes the whole list, because kind 10000 is replaceable — sending only the
 * key being muted would unmute everyone already on it.
 */
export function useToggleMute() {
  const session = useRelaySession();
  const queryClient = useQueryClient();
  const myPubkey = useMyPubkey();
  const muted = useMuteList();

  return useMutation({
    mutationFn: async (pubkey: string) => {
      if (normalizePubkey(pubkey) === normalizePubkey(myPubkey ?? "")) {
        throw new Error("自分をミュートすることはできません。");
      }
      return session.publish(buildMuteListTemplate(toggleMuted(muted, pubkey)));
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: [...MUTE_KEY, myPubkey] }),
  });
}
