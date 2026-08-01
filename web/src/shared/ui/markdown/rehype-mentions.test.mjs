import assert from "node:assert/strict";
import test from "node:test";

import { MENTION_ATTRIBUTE, rehypeMentions } from "./rehype-mentions.ts";

/** Run the plugin over a tree, the way unified would. */
function run(tree, labels) {
  rehypeMentions(labels)()(tree);
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

test("wraps a known name in a mention element", () => {
  const tree = run(root([element("p", [text("@Ken ping")])]), ["Ken"]);
  const [mention, rest] = tree.children[0].children;

  assert.equal(mention.tagName, "span");
  assert.equal(mention.properties[MENTION_ATTRIBUTE], "Ken");
  assert.deepEqual(mention.children, [text("@Ken")]);
  assert.deepEqual(rest, text(" ping"));
});

test("leaves an unknown name as plain text", () => {
  const tree = run(root([element("p", [text("@Nobody hi")])]), ["Ken"]);
  assert.deepEqual(tree.children[0].children, [text("@Nobody hi")]);
});

test("matches a name containing a space", () => {
  const tree = run(root([element("p", [text("@田中 健 おはよう")])]), [
    "田中 健",
  ]);
  const [mention] = tree.children[0].children;
  assert.equal(mention.properties[MENTION_ATTRIBUTE], "田中 健");
  assert.deepEqual(mention.children, [text("@田中 健")]);
});

test("prefers the longer of two names sharing a prefix", () => {
  const tree = run(root([element("p", [text("@健二 です")])]), ["健", "健二"]);
  const [mention] = tree.children[0].children;
  assert.equal(mention.properties[MENTION_ATTRIBUTE], "健二");
});

test("does not chip inside code, pre, or a link", () => {
  for (const tag of ["code", "pre", "a"]) {
    const tree = run(root([element(tag, [text("@Ken")])]), ["Ken"]);
    assert.deepEqual(
      tree.children[0].children,
      [text("@Ken")],
      `${tag} should be opaque`,
    );
  }
});

test("descends into nested elements", () => {
  const tree = run(
    root([element("blockquote", [element("p", [text("@Ken")])])]),
    ["Ken"],
  );
  const [mention] = tree.children[0].children[0].children;
  assert.equal(mention.properties[MENTION_ATTRIBUTE], "Ken");
});

test("does nothing when no names are known", () => {
  const tree = run(root([element("p", [text("@Ken")])]), []);
  assert.deepEqual(tree.children[0].children, [text("@Ken")]);
});

test("requires a word boundary before the at sign", () => {
  const tree = run(root([element("p", [text("mail@Ken.example")])]), ["Ken"]);
  assert.deepEqual(tree.children[0].children, [text("mail@Ken.example")]);
});

test("chips every occurrence in one text node", () => {
  const tree = run(root([element("p", [text("@Ken and @Aya")])]), [
    "Ken",
    "Aya",
  ]);
  const kinds = tree.children[0].children.map((node) => node.type);
  assert.deepEqual(kinds, ["element", "text", "element"]);
});
