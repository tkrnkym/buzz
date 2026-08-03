/**
 * The three moderator-only reads: the report queue, the audit log, and who is
 * currently restricted.
 *
 * HTTP rather than Nostr filters, and deliberately so. These are not events — the
 * relay derives them from state it maintains while processing commands, and there
 * is no kind to subscribe to. They are also the one part of moderation an
 * ordinary member must not see, which an authenticated GET expresses and a REQ
 * cannot: the relay answers 403 unless the NIP-98 signer is an owner or admin.
 */

import type {
  CommunityRestriction,
  ModerationAction,
  ModerationReport,
} from "@/features/moderation/moderation-model";
import { makeNip98AuthHeader } from "@/shared/lib/nip98";
import { relayHttpBaseUrl } from "@/shared/lib/relay-url";

const REQUEST_TIMEOUT_MS = 15_000;

async function authorizedGet<T>(path: string): Promise<T> {
  const url = `${relayHttpBaseUrl().replace(/\/+$/, "")}${path}`;
  // The signed `u` tag must be the exact URL including its query string, or the
  // relay rejects the header as being for a different request.
  const authorization = await makeNip98AuthHeader(url, "GET");
  const response = await fetch(url, {
    headers: { Authorization: authorization },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    if (response.status === 403) {
      throw new Error("この操作にはモデレーター権限が必要です。");
    }
    throw new Error(`HTTP ${response.status}`);
  }
  return (await response.json()) as T;
}

function query(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const encoded = search.toString();
  return encoded ? `?${encoded}` : "";
}

export function fetchModerationReports(options?: {
  status?: string;
  limit?: number;
}): Promise<ModerationReport[]> {
  return authorizedGet<ModerationReport[]>(
    `/moderation/reports${query({
      status: options?.status,
      limit: options?.limit,
    })}`,
  );
}

export function fetchModerationAudit(
  limit?: number,
): Promise<ModerationAction[]> {
  return authorizedGet<ModerationAction[]>(
    `/moderation/audit${query({ limit })}`,
  );
}

export function fetchModerationRestricted(): Promise<CommunityRestriction[]> {
  return authorizedGet<CommunityRestriction[]>("/moderation/restricted");
}
