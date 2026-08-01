import assert from "node:assert/strict";
import test from "node:test";

import { EMOJI_ATTRIBUTE, rehypeEmoji } from "./rehype-emoji.ts";

function run(tree, pairs) {
  rehypeEmoji(new Map(pairs))()(tree);
  return tree;
}

const text = (value) => ({ type: "text", value });
const element = (tagName, children) => ({
  type: "element",
  tagName,
  properties: {},
  children,
});
const root = (children) => ({ type: "root", children });

const WAVE = [["wave", "https://example.com/wave.png"]];

test("a defined shortcode becomes an image", () => {
  const tree = run(root([element("p", [text("hi :wave: there")])]), WAVE);
  const [before, image, after] = tree.children[0].children;

  assert.deepEqual(before, text("hi "));
  assert.equal(image.tagName, "img");
  assert.equal(image.properties[EMOJI_ATTRIBUTE], "wave");
  assert.equal(image.properties.src, "https://example.com/wave.png");
  // The alt is what the author typed, so a reader without images sees it.
  assert.equal(image.properties.alt, ":wave:");
  assert.deepEqual(after, text(" there"));
});

test("an undefined shortcode stays literal", () => {
  const tree = run(root([element("p", [text("ship :shipit: now")])]), WAVE);
  assert.deepEqual(tree.children[0].children, [text("ship :shipit: now")]);
});

test("a shortcode inside code is code", () => {
  for (const tag of ["code", "pre"]) {
    const tree = run(root([element(tag, [text(":wave:")])]), WAVE);
    assert.deepEqual(tree.children[0].children, [text(":wave:")]);
  }
});

test("every occurrence is replaced", () => {
  const tree = run(root([element("p", [text(":wave::wave:")])]), WAVE);
  const kinds = tree.children[0].children.map((node) => node.tagName);
  assert.deepEqual(kinds, ["img", "img"]);
});

test("no definitions means no walk at all", () => {
  const tree = run(root([element("p", [text(":wave:")])]), []);
  assert.deepEqual(tree.children[0].children, [text(":wave:")]);
});

test("a partly-defined line keeps the undefined half as text", () => {
  const tree = run(root([element("p", [text(":wave: :nope:")])]), WAVE);
  const [image, rest] = tree.children[0].children;
  assert.equal(image.tagName, "img");
  assert.deepEqual(rest, text(" :nope:"));
});
