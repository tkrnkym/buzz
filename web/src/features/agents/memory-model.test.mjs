import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMemoryGraph,
  CORE_SLUG,
  memoryRefs,
} from "@/features/agents/memory-model";

const entry = (slug, body, updatedAt = 1000) => ({ slug, body, updatedAt });

test("refs are read from double brackets, deduplicated, in order", () => {
  assert.deepEqual(memoryRefs("see [[b]] and [[a]] and [[b]] again"), [
    "b",
    "a",
  ]);
  assert.deepEqual(memoryRefs("nothing here"), []);
  // An unclosed bracket is not a ref — a body that mentions "[[" in prose must
  // not produce a phantom dangling entry.
  assert.deepEqual(memoryRefs("half [[open"), []);
});

test("the tree is rooted at core and follows its refs", () => {
  const graph = buildMemoryGraph([
    entry(CORE_SLUG, "start [[mem/a]]"),
    entry("mem/a", "then [[mem/b]]"),
    entry("mem/b", "end"),
  ]);
  assert.equal(graph.root?.entry.slug, CORE_SLUG);
  assert.equal(graph.root?.children[0].entry.slug, "mem/a");
  assert.equal(graph.root?.children[0].children[0].entry.slug, "mem/b");
  assert.deepEqual(graph.orphans, []);
  assert.deepEqual(graph.dangling, []);
  assert.equal(graph.count, 3);
});

test("without a core there is no tree, and everything is an orphan", () => {
  // The agent consults what it can reach from core. With no core it reaches
  // nothing, which is a state worth showing rather than papering over.
  const graph = buildMemoryGraph([entry("mem/a", "alone")]);
  assert.equal(graph.root, null);
  assert.deepEqual(
    graph.orphans.map((row) => row.slug),
    ["mem/a"],
  );
});

test("memories nothing links to are orphans, sorted by slug", () => {
  const graph = buildMemoryGraph([
    entry(CORE_SLUG, "only [[mem/linked]]"),
    entry("mem/linked", "reached"),
    entry("mem/z", "unreached"),
    entry("mem/b", "also unreached"),
  ]);
  assert.deepEqual(
    graph.orphans.map((row) => row.slug),
    ["mem/b", "mem/z"],
  );
});

test("a ref to a slug that is not there is dangling, with who cited it", () => {
  const graph = buildMemoryGraph([
    entry(CORE_SLUG, "gone: [[mem/deleted]]"),
    entry("mem/orphan", "also gone: [[mem/deleted]]"),
  ]);
  assert.equal(graph.dangling.length, 1);
  assert.equal(graph.dangling[0].slug, "mem/deleted");
  // Both citations are named, including the one from an orphan — a broken ref is
  // broken whether or not the agent gets there.
  assert.deepEqual(graph.dangling[0].referencedBy.sort(), [
    CORE_SLUG,
    "mem/orphan",
  ]);
});

test("a cycle terminates, and the memory appears once", () => {
  const graph = buildMemoryGraph([
    entry(CORE_SLUG, "[[mem/a]]"),
    entry("mem/a", "back to [[mem/core]] and on to [[mem/b]]"),
    entry("mem/b", "[[mem/a]]"),
  ]);
  const a = graph.root?.children[0];
  assert.equal(a?.entry.slug, "mem/a");
  // The ref back to core is dropped rather than recursing.
  assert.deepEqual(
    a?.children.map((child) => child.entry.slug),
    ["mem/b"],
  );
  assert.deepEqual(a?.children[0].children, []);
  // Visited once, so nothing became an orphan by being skipped in the tree.
  assert.deepEqual(graph.orphans, []);
});

test("a memory reached twice keeps its first position and is not an orphan", () => {
  const graph = buildMemoryGraph([
    entry(CORE_SLUG, "[[mem/a]] [[mem/b]]"),
    entry("mem/a", "[[mem/shared]]"),
    entry("mem/b", "[[mem/shared]]"),
    entry("mem/shared", "cited twice"),
  ]);
  const [a, b] = graph.root?.children ?? [];
  assert.deepEqual(
    a.children.map((child) => child.entry.slug),
    ["mem/shared"],
  );
  // Dropped from the second parent rather than duplicated.
  assert.deepEqual(b.children, []);
  assert.deepEqual(graph.orphans, []);
});

test("an empty list is an empty graph, not an error", () => {
  const graph = buildMemoryGraph([]);
  assert.equal(graph.root, null);
  assert.equal(graph.count, 0);
  assert.deepEqual(graph.orphans, []);
  assert.deepEqual(graph.dangling, []);
});
