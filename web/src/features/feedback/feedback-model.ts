/**
 * Product feedback (kind 42000).
 *
 * Real, not a mock-up: the relay accepts this kind at ingest and sidecars it to a
 * feedback table rather than storing it as an event. So it is never fanned out and
 * never appears in anyone's timeline — the reader is telling the operators
 * something, not posting.
 *
 * The contract is narrow and worth stating, because each rule is one the relay
 * enforces by refusing the event:
 *
 * - At most **one** `category` tag, and its value must be one of three. Two tags
 *   is a rejection, not a "last one wins".
 * - A non-empty body. An empty one is refused, so the UI must not offer to send
 *   a category alone.
 * - Attachments ride `imeta` tags and are verified against the relay's own media
 *   host, so a URL from anywhere else fails.
 */

import { KIND_PRODUCT_FEEDBACK } from "@/shared/constants/kinds";

/** The relay's `CATEGORIES`. Anything else is refused at ingest. */
export type FeedbackCategory = "bug" | "praise" | "needs-work";

export const FEEDBACK_CATEGORIES: ReadonlyArray<{
  value: FeedbackCategory;
  label: string;
  description: string;
}> = [
  {
    value: "bug",
    label: "うまく動かない",
    description: "壊れている、期待と違う",
  },
  {
    value: "needs-work",
    label: "もっとこうしたい",
    description: "動くけれど使いにくい",
  },
  { value: "praise", label: "よかった", description: "助かった、気に入った" },
];

/** The relay's `MAX_BODY_BYTES`, as a character budget the UI can show. */
export const FEEDBACK_BODY_MAX_BYTES = 32 * 1024;

export function feedbackBodyBytes(body: string): number {
  return new TextEncoder().encode(body).length;
}

/**
 * Whether this feedback can be sent.
 *
 * Both rules mirror a relay refusal: an empty body is rejected outright, and an
 * over-long one is too. Checking here means the reader is told before they lose
 * what they typed.
 */
export function canSendFeedback(body: string): boolean {
  const trimmed = body.trim();
  return (
    trimmed.length > 0 && feedbackBodyBytes(trimmed) <= FEEDBACK_BODY_MAX_BYTES
  );
}

/**
 * Event template for a feedback submission.
 *
 * The category is optional — the relay accepts none — but at most one tag, which
 * is why this takes a single value rather than a list.
 */
export function buildFeedbackTemplate(input: {
  body: string;
  category?: FeedbackCategory;
  /** NIP-92 `imeta` tags for screenshots already uploaded to the relay's host. */
  attachments?: string[][];
}): { kind: number; content: string; tags: string[][] } {
  const tags: string[][] = [];
  if (input.category) tags.push(["category", input.category]);
  return {
    kind: KIND_PRODUCT_FEEDBACK,
    content: input.body.trim(),
    tags: [...tags, ...(input.attachments ?? [])],
  };
}
