/**
 * Turn `:shortcode:` in message text into an image, per NIP-30.
 *
 * A rehype pass for the same reason mentions are one: `:pipe:` inside a code
 * span is code, and only a tree walk knows that. Splitting the text node here
 * also means the image is a real element with an `alt`, so a reader without
 * images still sees `:shortcode:` rather than nothing.
 *
 * The URL map comes from the event's own `emoji` tags — not from the reader's
 * palette. That is the point of NIP-30: the definition travels with the message,
 * so a client that has never seen the author's set still renders it, and a
 * shortcode the author did not define stays literal text rather than silently
 * picking up someone else's picture.
 */

export const EMOJI_ATTRIBUTE = "data-emoji";

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

/** Subtrees where a colon-wrapped word is not an emoji. */
const OPAQUE_TAGS = new Set(["code", "pre"]);

const SHORTCODE = /:([a-z0-9_]+):/g;

function isElement(node: HastNode): node is HastElement {
  return node.type === "element";
}

function isText(node: HastNode): node is HastText {
  return node.type === "text";
}

function splitTextNode(node: HastText, urls: Map<string, string>): HastNode[] {
  const out: HastNode[] = [];
  let cursor = 0;
  SHORTCODE.lastIndex = 0;

  let match = SHORTCODE.exec(node.value);
  while (match) {
    const url = urls.get(match[1]);
    if (url) {
      if (match.index > cursor) {
        out.push({
          type: "text",
          value: node.value.slice(cursor, match.index),
        });
      }
      out.push({
        type: "element",
        tagName: "img",
        properties: {
          [EMOJI_ATTRIBUTE]: match[1],
          alt: match[0],
          src: url,
        },
        children: [],
      });
      cursor = match.index + match[0].length;
    }
    match = SHORTCODE.exec(node.value);
  }

  if (out.length === 0) return [node];
  if (cursor < node.value.length) {
    out.push({ type: "text", value: node.value.slice(cursor) });
  }
  return out;
}

function walk(node: HastNode, urls: Map<string, string>): void {
  const children = (node as { children?: HastNode[] }).children;
  if (!children) return;

  const next: HastNode[] = [];
  for (const child of children) {
    if (isText(child)) {
      next.push(...splitTextNode(child, urls));
      continue;
    }
    if (isElement(child) && OPAQUE_TAGS.has(child.tagName)) {
      next.push(child);
      continue;
    }
    walk(child, urls);
    next.push(child);
  }
  (node as { children: HastNode[] }).children = next;
}

/**
 * Rehype plugin factory.
 *
 * `urls` maps a bare shortcode to its image URL. Empty means a no-op, which is
 * the correct fallback: `:shipit:` written by someone who defined nothing stays
 * exactly as they typed it.
 */
export function rehypeEmoji(urls: Map<string, string>) {
  return () => (tree: HastNode) => {
    if (urls.size === 0) return;
    walk(tree, urls);
  };
}
