/**
 * Turn `@Name` in message text into a markable element.
 *
 * A rehype pass rather than a regex over the rendered output, because the tree
 * is where the context lives: a mention inside a code span or a link is not a
 * mention, and only a tree walk can tell. Splitting text nodes here also means
 * the chip is a real element the renderer styles, not HTML injected after the
 * fact.
 *
 * Written against the hast shape directly — a `visit` helper would be a
 * dependency for one recursive function.
 */

import { findMentionSpans } from "@/features/messages/lib/mentions";

/** Attribute the renderer looks for. The value is the matched display name. */
export const MENTION_ATTRIBUTE = "data-mention";

interface HastText {
  type: "text";
  value: string;
}

interface HastElement {
  type: "element";
  tagName: string;
  properties?: Record<string, unknown>;
  children: HastNode[];
}

type HastNode =
  | HastText
  | HastElement
  | { type: string; children?: HastNode[] };

/**
 * Subtrees where an `@` is not a mention.
 *
 * `code`/`pre` because the author is quoting, and `a` because the anchor text
 * belongs to the link — chipping inside it would produce a control inside a
 * control.
 */
const OPAQUE_TAGS = new Set(["code", "pre", "a"]);

function isElement(node: HastNode): node is HastElement {
  return node.type === "element";
}

function isText(node: HastNode): node is HastText {
  return node.type === "text";
}

function splitTextNode(node: HastText, labels: string[]): HastNode[] {
  const spans = findMentionSpans(node.value, labels);
  if (spans.length === 0) return [node];

  const out: HastNode[] = [];
  let cursor = 0;
  for (const span of spans) {
    if (span.from > cursor) {
      out.push({ type: "text", value: node.value.slice(cursor, span.from) });
    }
    out.push({
      type: "element",
      tagName: "span",
      properties: { [MENTION_ATTRIBUTE]: span.label },
      children: [{ type: "text", value: node.value.slice(span.from, span.to) }],
    });
    cursor = span.to;
  }
  if (cursor < node.value.length) {
    out.push({ type: "text", value: node.value.slice(cursor) });
  }
  return out;
}

function walk(node: HastNode, labels: string[]): void {
  const children = (node as { children?: HastNode[] }).children;
  if (!children) return;

  const next: HastNode[] = [];
  for (const child of children) {
    if (isText(child)) {
      next.push(...splitTextNode(child, labels));
      continue;
    }
    if (isElement(child) && OPAQUE_TAGS.has(child.tagName)) {
      next.push(child);
      continue;
    }
    walk(child, labels);
    next.push(child);
  }
  (node as { children: HastNode[] }).children = next;
}

/**
 * Rehype plugin factory.
 *
 * Returns a no-op transform when there are no names to match, so a community
 * whose profiles have not loaded yet pays nothing and renders plain text —
 * which is the correct fallback: a chip claims this client resolved a person.
 */
export function rehypeMentions(labels: string[]) {
  const known = labels.filter(Boolean);
  return () => (tree: HastNode) => {
    if (known.length === 0) return;
    walk(tree, known);
  };
}
