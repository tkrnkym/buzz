/**
 * ProseMirror document → Markdown.
 *
 * The rich composer edits a document; the event carries text. Markdown is what
 * that text has to be, because it is what every other Nostr client renders and
 * what this app's own renderer parses — a message is not allowed to depend on
 * having been written here.
 *
 * Hand-written rather than a generic HTML-to-Markdown converter: the set of
 * nodes and marks the editor can produce is small and fixed (see
 * `RichComposer`), so this covers it exactly and there is nothing to guess
 * about. A converter would also happily emit constructs the renderer does not
 * accept.
 */

/** The shape TipTap's `editor.getJSON()` returns. */
export interface ProseMirrorNode {
  type: string;
  text?: string;
  content?: ProseMirrorNode[];
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  attrs?: Record<string, unknown>;
}

/** Marks that wrap inline text, innermost first. */
const MARK_DELIMITERS: Record<string, string> = {
  bold: "**",
  italic: "*",
  strike: "~~",
};

/**
 * Escape the characters that would otherwise be read as markup.
 *
 * Only the ones that actually start a construct at the point they appear: a
 * bare `*` in prose is common, and escaping every one of them would fill
 * ordinary messages with backslashes that other clients show literally when
 * they do not parse markdown.
 */
function escapeText(text: string): string {
  return text.replace(/([\\`*_[\]])/g, "\\$1");
}

function serializeText(node: ProseMirrorNode): string {
  const raw = node.text ?? "";
  const marks = node.marks ?? [];

  // Code is exclusive: its content is literal, so escaping it would put
  // backslashes inside the span, and wrapping it in emphasis is not a thing
  // markdown expresses.
  if (marks.some((mark) => mark.type === "code")) {
    // A backtick inside code needs a longer fence than anything it contains.
    const longest = /`+/.exec(raw)?.[0].length ?? 0;
    const fence = "`".repeat(longest + 1);
    const pad = raw.startsWith("`") || raw.endsWith("`") ? " " : "";
    return `${fence}${pad}${raw}${pad}${fence}`;
  }

  let out = escapeText(raw);
  for (const mark of marks) {
    const delimiter = MARK_DELIMITERS[mark.type];
    if (delimiter) out = `${delimiter}${out}${delimiter}`;
  }

  const link = marks.find((mark) => mark.type === "link");
  if (link) {
    const href = typeof link.attrs?.href === "string" ? link.attrs.href : "";
    // An autolink — text identical to its target — stays bare. `[url](url)` is
    // the same link written twice and reads as noise in a chat message.
    if (href && href !== raw) out = `[${out}](${href})`;
    else if (href) out = href;
  }

  return out;
}

function serializeInline(nodes: ProseMirrorNode[] | undefined): string {
  if (!nodes) return "";
  return nodes
    .map((node) => {
      if (node.type === "text") return serializeText(node);
      // A single newline: the renderer runs `remark-breaks`, so this is a line
      // break rather than a paragraph split.
      if (node.type === "hardBreak") return "\n";
      return serializeInline(node.content);
    })
    .join("");
}

/**
 * A list, as lines relative to its own left edge.
 *
 * Nesting is handled by the caller indenting everything after an item's first
 * line, so a nested list does not need to know how deep it is — it comes back
 * flush and gets pushed right once per level it sits under.
 */
function serializeList(node: ProseMirrorNode, ordered: boolean): string[] {
  const lines: string[] = [];
  let counter =
    typeof node.attrs?.start === "number" ? (node.attrs.start as number) : 1;

  for (const item of node.content ?? []) {
    const marker = ordered ? `${counter++}.` : "-";
    // Joined with a single newline, which keeps the list tight: a blank line
    // between an item and the list nested under it makes every item in the
    // parent render with paragraph spacing.
    const [first = "", ...rest] = serializeBlocks(item.content ?? [])
      .join("\n")
      .split("\n");
    lines.push(`${marker} ${first}`.trimEnd());
    // Continuation lines sit under the marker so the item keeps its shape.
    for (const line of rest) lines.push(line ? `  ${line}` : "");
  }
  return lines;
}

function serializeBlocks(nodes: ProseMirrorNode[]): string[] {
  const blocks: string[] = [];

  for (const node of nodes) {
    if (node.type === "paragraph") {
      blocks.push(serializeInline(node.content));
      continue;
    }
    if (node.type === "heading") {
      const level = Math.min(
        Math.max(
          typeof node.attrs?.level === "number" ? node.attrs.level : 1,
          1,
        ),
        3,
      );
      blocks.push(`${"#".repeat(level)} ${serializeInline(node.content)}`);
      continue;
    }
    if (node.type === "codeBlock") {
      const language =
        typeof node.attrs?.language === "string" ? node.attrs.language : "";
      // The body is literal: `serializeInline` would escape it.
      const body = (node.content ?? [])
        .map((child) => child.text ?? "")
        .join("");
      blocks.push(`\`\`\`${language}\n${body}\n\`\`\``);
      continue;
    }
    if (node.type === "blockquote") {
      const inner = serializeBlocks(node.content ?? []).join("\n\n");
      blocks.push(
        inner
          .split("\n")
          .map((line) => (line ? `> ${line}` : ">"))
          .join("\n"),
      );
      continue;
    }
    if (node.type === "bulletList" || node.type === "orderedList") {
      blocks.push(serializeList(node, node.type === "orderedList").join("\n"));
      continue;
    }
    if (node.type === "horizontalRule") {
      blocks.push("---");
      continue;
    }
    // Anything else: keep its text rather than dropping the author's words.
    blocks.push(serializeInline(node.content));
  }

  return blocks;
}

/**
 * Serialize a TipTap document to the markdown the event will carry.
 *
 * Blocks are separated by a blank line and the result trimmed, so an editor the
 * author has emptied produces `""` rather than a string of newlines that would
 * pass an `if (content)` check and publish an empty message.
 */
export function serializeToMarkdown(doc: ProseMirrorNode): string {
  return serializeBlocks(doc.content ?? [])
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
