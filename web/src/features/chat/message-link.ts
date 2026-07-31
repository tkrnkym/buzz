/**
 * `nuxx://message` deep links.
 *
 * Format: `nuxx://message?channel=<uuid>&id=<eventId>[&thread=<rootId>]`
 *
 * It lives in the chat feature, not in `shared/ui`: the markdown renderer must
 * not know what a message link is — it takes link handling as an injected
 * extension point, which is what keeps the renderer a reusable primitive.
 *
 * Links are written and read with this one scheme.
 */

/** Scheme new links are written with. */
const MESSAGE_LINK_SCHEME = "nuxx:";
const MESSAGE_LINK_HOST = "message";

/** Every scheme a message link may legitimately carry. */
const ACCEPTED_SCHEMES = [MESSAGE_LINK_SCHEME];

export interface ParsedMessageLink {
  channelId: string;
  messageId: string;
  threadRootId: string | null;
}

export type MessageLinkParseResult =
  | { ok: true; value: ParsedMessageLink }
  | { ok: false; reason: string };

/**
 * Build a `nuxx://message` URL.
 *
 * An empty `threadRootId` counts as "no thread", so callers can pass a resolved
 * thread root straight through without a null check.
 */
export function buildMessageLink(input: {
  channelId: string;
  messageId: string;
  threadRootId?: string | null;
}): string {
  if (!input.channelId) {
    throw new Error("buildMessageLink: channelId is required");
  }
  if (!input.messageId) {
    throw new Error("buildMessageLink: messageId is required");
  }

  const params = new URLSearchParams();
  params.set("channel", input.channelId);
  params.set("id", input.messageId);
  if (input.threadRootId) {
    params.set("thread", input.threadRootId);
  }
  return `${MESSAGE_LINK_SCHEME}//${MESSAGE_LINK_HOST}?${params.toString()}`;
}

/**
 * Parse a message link.
 *
 * Returns a result rather than throwing so a malformed link can render as plain
 * text instead of breaking the whole message.
 */
export function parseMessageLink(url: string): MessageLinkParseResult {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: "invalid-url" };
  }

  if (!ACCEPTED_SCHEMES.includes(parsed.protocol)) {
    return { ok: false, reason: "wrong-scheme" };
  }
  // `new URL("nuxx://message?…")` puts "message" in `hostname`.
  if (parsed.hostname !== MESSAGE_LINK_HOST) {
    return { ok: false, reason: "wrong-host" };
  }

  const channelId = parsed.searchParams.get("channel");
  if (!channelId) {
    return { ok: false, reason: "missing-channel" };
  }
  const messageId = parsed.searchParams.get("id");
  if (!messageId) {
    return { ok: false, reason: "missing-id" };
  }

  return {
    ok: true,
    value: {
      channelId,
      messageId,
      threadRootId: parsed.searchParams.get("thread") ?? null,
    },
  };
}

/** Cheap pre-check used before parsing. */
export function isMessageLink(href: string | undefined | null): boolean {
  if (!href) return false;
  return ACCEPTED_SCHEMES.some((scheme) => {
    const prefix = `${scheme}//${MESSAGE_LINK_HOST}`;
    return href === prefix || href.startsWith(`${prefix}?`);
  });
}

export type MessageLinkRenderTarget =
  | { kind: "pill"; link: ParsedMessageLink }
  | { kind: "label"; link: ParsedMessageLink }
  | { kind: "none" };

/**
 * How a markdown anchor should render as message-link UI.
 *
 * Both CommonMark autolinks (`<nuxx://message?…>`) and explicitly labelled links
 * arrive as anchors. An autolink has label === href and becomes a pill; a link
 * the author labelled keeps that label.
 */
export function resolveMessageLinkRenderTarget(input: {
  href: string;
  label: string;
}): MessageLinkRenderTarget {
  if (!isMessageLink(input.href)) return { kind: "none" };

  const parsed = parseMessageLink(input.href);
  if (!parsed.ok) return { kind: "none" };

  return {
    kind: input.label === input.href ? "pill" : "label",
    link: parsed.value,
  };
}
