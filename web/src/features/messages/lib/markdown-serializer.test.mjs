import assert from "node:assert/strict";
import test from "node:test";

import { serializeToMarkdown } from "./markdown-serializer.ts";

const doc = (...content) => ({ type: "doc", content });
const p = (...content) => ({ type: "paragraph", content });
const text = (value, ...marks) => ({
  type: "text",
  text: value,
  ...(marks.length ? { marks } : {}),
});
const mark = (type, attrs) => ({ type, ...(attrs ? { attrs } : {}) });

test("a paragraph is its text", () => {
  assert.equal(serializeToMarkdown(doc(p(text("hello")))), "hello");
});

test("blocks are separated by a blank line", () => {
  assert.equal(
    serializeToMarkdown(doc(p(text("one")), p(text("two")))),
    "one\n\ntwo",
  );
});

test("bold, italic and strike round-trip to their delimiters", () => {
  assert.equal(
    serializeToMarkdown(
      doc(
        p(
          text("a", mark("bold")),
          text("b", mark("italic")),
          text("c", mark("strike")),
        ),
      ),
    ),
    "**a***b*~~c~~",
  );
});

test("code is literal and not escaped", () => {
  assert.equal(
    serializeToMarkdown(doc(p(text("a * b", mark("code"))))),
    "`a * b`",
  );
});

test("code containing a backtick gets a longer fence", () => {
  assert.equal(
    serializeToMarkdown(doc(p(text("a ` b", mark("code"))))),
    "``a ` b``",
  );
});

test("markup characters in prose are escaped", () => {
  // Otherwise a message about `*` would render as emphasis somewhere else.
  assert.equal(
    serializeToMarkdown(doc(p(text("2 * 3 [maybe]")))),
    "2 \\* 3 \\[maybe\\]",
  );
});

test("a link becomes an inline link", () => {
  assert.equal(
    serializeToMarkdown(
      doc(p(text("docs", mark("link", { href: "https://example.com" })))),
    ),
    "[docs](https://example.com)",
  );
});

test("an autolink stays bare", () => {
  // `[url](url)` is the same link written twice.
  assert.equal(
    serializeToMarkdown(
      doc(
        p(
          text(
            "https://example.com",
            mark("link", {
              href: "https://example.com",
            }),
          ),
        ),
      ),
    ),
    "https://example.com",
  );
});

test("a hard break is a single newline", () => {
  // The renderer runs remark-breaks, so this is a line break not a new block.
  assert.equal(
    serializeToMarkdown(
      doc(p(text("one"), { type: "hardBreak" }, text("two"))),
    ),
    "one\ntwo",
  );
});

test("a bullet list is dashed", () => {
  assert.equal(
    serializeToMarkdown(
      doc({
        type: "bulletList",
        content: [
          { type: "listItem", content: [p(text("one"))] },
          { type: "listItem", content: [p(text("two"))] },
        ],
      }),
    ),
    "- one\n- two",
  );
});

test("an ordered list numbers from its start attribute", () => {
  assert.equal(
    serializeToMarkdown(
      doc({
        type: "orderedList",
        attrs: { start: 3 },
        content: [
          { type: "listItem", content: [p(text("three"))] },
          { type: "listItem", content: [p(text("four"))] },
        ],
      }),
    ),
    "3. three\n4. four",
  );
});

test("a nested list is indented under its parent item", () => {
  assert.equal(
    serializeToMarkdown(
      doc({
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [
              p(text("outer")),
              {
                type: "bulletList",
                content: [{ type: "listItem", content: [p(text("inner"))] }],
              },
            ],
          },
        ],
      }),
    ),
    "- outer\n  - inner",
  );
});

test("a code block keeps its language and its literal body", () => {
  assert.equal(
    serializeToMarkdown(
      doc({
        type: "codeBlock",
        attrs: { language: "rust" },
        content: [text("let x = *y;")],
      }),
    ),
    "```rust\nlet x = *y;\n```",
  );
});

test("a blockquote prefixes every line", () => {
  assert.equal(
    serializeToMarkdown(
      doc({
        type: "blockquote",
        content: [p(text("one")), p(text("two"))],
      }),
    ),
    "> one\n>\n> two",
  );
});

test("a heading is capped at three levels", () => {
  // The renderer styles h1–h3; deeper ones would render as plain text.
  assert.equal(
    serializeToMarkdown(
      doc({ type: "heading", attrs: { level: 6 }, content: [text("deep")] }),
    ),
    "### deep",
  );
});

test("an emptied editor serializes to nothing", () => {
  // Not "\n\n": an `if (content)` check would pass and publish a blank message.
  assert.equal(serializeToMarkdown(doc(p(), p())), "");
});

test("an empty document is empty", () => {
  assert.equal(serializeToMarkdown({ type: "doc" }), "");
});
