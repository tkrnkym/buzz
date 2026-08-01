/**
 * Mentions: `@Name` in the body, `p` tags on the event.
 *
 * The two halves do different jobs and must not be confused:
 *
 * - The **`p` tags are the truth.** The relay drives mention notifications from
 *   them, as do agent harnesses. They carry pubkeys, so they survive a rename.
 * - The **`@Name` text is presentation.** It is what the author typed and what
 *   every other client will render, including ones that know nothing about this
 *   app. It is matched against known names at render time to draw a chip.
 *
 * Deriving the tags from the text would be wrong in both directions: two people
 * can share a display name, and a name can contain a space, so the parse is
 * ambiguous. The composer therefore records which pubkey each insertion meant
 * and publishes that, exactly as the desktop client did.
 */

import { normalizePubkey } from "@/features/profile/profile-model";

/**
 * The `@` token being typed at the caret, or `null`.
 *
 * A mention starts at a word boundary — start of input or after whitespace — so
 * an email address does not open an autocomplete on every keystroke. The query
 * deliberately allows spaces so `@田中 健` can be completed, but stops at a
 * second one, because beyond that almost any sentence is a "query".
 */
export function activeMentionQuery(
  text: string,
  caret: number,
): { query: string; from: number } | null {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf("@");
  if (at === -1) return null;

  const preceding = at === 0 ? "" : before[at - 1];
  if (preceding && !/\s/.test(preceding)) return null;

  const query = before.slice(at + 1);
  // A newline ends the mention outright; so does a third word.
  if (/\n/.test(query)) return null;
  if (query.split(/\s+/).length > 2) return null;

  return { query, from: at };
}

/**
 * Replace the `@` token at `from` with a completed mention.
 *
 * A trailing space is added so the next keystroke does not re-open the
 * autocomplete against the name that was just accepted.
 */
export function applyMention(
  text: string,
  from: number,
  caret: number,
  label: string,
): { text: string; caret: number } {
  const inserted = `@${label} `;
  return {
    text: text.slice(0, from) + inserted + text.slice(caret),
    caret: from + inserted.length,
  };
}

/**
 * Keep only the mentions whose `@Name` still appears in the body.
 *
 * The composer collects a pubkey each time one is inserted, but the author may
 * then delete the text. Publishing a `p` tag for a name that is no longer in the
 * message would notify someone about a message that does not mention them —
 * which reads, correctly, as spam.
 */
export function survivingMentions(
  text: string,
  inserted: { pubkey: string; label: string }[],
): string[] {
  const kept = new Set<string>();
  for (const mention of inserted) {
    if (text.includes(`@${mention.label}`)) {
      kept.add(normalizePubkey(mention.pubkey));
    }
  }
  return [...kept];
}

/**
 * The `p` tags an outgoing message carries.
 *
 * A DM addresses every other participant whether or not the text names them:
 * that is what the conversation *is*, and a DM with no recipient tags notifies
 * nobody. A channel message notifies only the people it actually mentions.
 * Ported from the desktop client's `messageMentionPubkeys`.
 *
 * The sender is always removed — a client that notified its own author would
 * badge every room the moment someone spoke in it.
 */
export function mentionRecipients({
  channelParticipants = [],
  explicitMentions,
  isDm,
  senderPubkey,
}: {
  /** A DM's participants, from its metadata. Empty for a channel. */
  channelParticipants?: string[];
  explicitMentions: string[];
  isDm: boolean;
  senderPubkey: string | null;
}): string[] {
  const candidates = isDm
    ? [...explicitMentions, ...channelParticipants]
    : explicitMentions;
  const sender = senderPubkey ? normalizePubkey(senderPubkey) : null;

  return [...new Set(candidates.map(normalizePubkey).filter(Boolean))].filter(
    (pubkey) => pubkey !== sender,
  );
}

/** `p` tags in the order the recipients were given. */
export function mentionTags(recipients: string[]): string[][] {
  return recipients.map((pubkey) => ["p", pubkey]);
}

export interface MentionSpan {
  from: number;
  to: number;
  label: string;
}

/**
 * Find `@Name` spans in rendered text, longest name first.
 *
 * Longest-first because "健" is a prefix of "健二": matching the short name
 * first would chip half of a longer one and leave the rest as loose text.
 * Matching is against known names only — an unknown `@something` stays plain,
 * because a chip implies this client resolved a person and it did not.
 */
export function findMentionSpans(
  text: string,
  knownLabels: string[],
): MentionSpan[] {
  const labels = [...new Set(knownLabels.filter(Boolean))].sort(
    (left, right) => right.length - left.length,
  );
  const spans: MentionSpan[] = [];
  const taken: boolean[] = new Array(text.length).fill(false);

  for (const label of labels) {
    const needle = `@${label}`;
    let index = text.indexOf(needle);
    while (index !== -1) {
      const end = index + needle.length;
      // A mention starts at a word boundary, and must not overlap one already
      // matched by a longer name.
      const preceding = index === 0 ? "" : text[index - 1];
      const overlaps = taken.slice(index, end).some(Boolean);
      if ((!preceding || /\s/.test(preceding)) && !overlaps) {
        spans.push({ from: index, to: end, label });
        for (let cursor = index; cursor < end; cursor++) taken[cursor] = true;
      }
      index = text.indexOf(needle, index + 1);
    }
  }

  return spans.sort((left, right) => left.from - right.from);
}
