import assert from "node:assert/strict";
import test from "node:test";

import {
  SEARCHABLE_KINDS,
  SEARCH_PAGE_SIZE,
  buildSearchFilter,
  excerpt,
  toSearchHits,
} from "@/features/search/search-model";

const event = (overrides = {}) => ({
  id: "ab".repeat(32),
  pubkey: "cd".repeat(32),
  kind: 9,
  created_at: 1_700_000_000,
  tags: [["h", "chan-1"]],
  content: "hello",
  sig: "ef".repeat(64),
  ...overrides,
});

test("a search always names kinds", () => {
  // An open-ended search hits the relay's p-gate and comes back 403 — it does
  // not search everything.
  const filter = buildSearchFilter("deploy", 1);
  assert.ok(Array.isArray(filter.kinds) && filter.kinds.length > 0);
  assert.equal(filter.search, "deploy");
  assert.equal(filter.page, 1);
  assert.equal(filter.limit, SEARCH_PAGE_SIZE);
});

test("only full-text-indexed kinds are asked for", () => {
  // The generated tsvector covers 0, 9, 40002, 45001, 45003. A kind outside it
  // is not an error — it silently never matches, which reads as a broken search
  // rather than an unindexed kind.
  const INDEXED = new Set([0, 9, 40002, 45001, 45003]);
  for (const kind of SEARCHABLE_KINDS) {
    assert.ok(INDEXED.has(kind), `kind ${kind} is not full-text indexed`);
  }
  // System rows render in the timeline but are not indexed, so asking for them
  // would be a silent dead end.
  assert.ok(!SEARCHABLE_KINDS.includes(40099));
});

test("a channel scope narrows the query on the server", () => {
  // Filtering client-side would fill each page with hits from elsewhere and
  // then discard most of them.
  const scoped = buildSearchFilter("deploy", 1, "chan-1");
  assert.deepEqual(scoped["#h"], ["chan-1"]);

  const unscoped = buildSearchFilter("deploy", 1, null);
  assert.equal(unscoped["#h"], undefined);
});

test("later pages are requested by number", () => {
  assert.equal(buildSearchFilter("deploy", 3).page, 3);
});

test("relevance order is preserved", () => {
  // The relay hydrates FTS hits through a lookup map specifically to keep
  // ranking; re-sorting by timestamp would throw away what made these the
  // answer.
  const hits = toSearchHits([
    event({ id: "11".repeat(32), created_at: 1_600_000_000 }),
    event({ id: "22".repeat(32), created_at: 1_700_000_000 }),
    event({ id: "33".repeat(32), created_at: 1_500_000_000 }),
  ]);

  assert.deepEqual(
    hits.map((hit) => hit.id),
    ["11".repeat(32), "22".repeat(32), "33".repeat(32)],
  );
});

test("a hit knows which channel to open", () => {
  const [hit] = toSearchHits([event()]);
  assert.equal(hit.channelId, "chan-1");
});

test("a hit with no channel tag is not given one", () => {
  // Forum posts carry no `h`; inventing one would render a dead link.
  const [hit] = toSearchHits([event({ tags: [] })]);
  assert.equal(hit.channelId, null);
});

test("an excerpt centres on the match", () => {
  const content = `${"a ".repeat(100)}needle${" b".repeat(100)}`;
  const result = excerpt(content, "needle");

  assert.ok(result.includes("needle"));
  assert.ok(result.length < content.length);
  assert.ok(result.startsWith("…") && result.endsWith("…"));
});

test("an excerpt matches regardless of case", () => {
  assert.ok(excerpt("The Deploy failed", "deploy").includes("Deploy"));
});

test("a stem-only match still yields an excerpt", () => {
  // Full-text search matches stems, so a hit need not contain the typed word
  // literally. Returning nothing here would show blank rows for real results.
  const result = excerpt("we run the pipeline nightly", "running");
  assert.ok(result.includes("run the pipeline"));
});

test("an excerpt collapses whitespace so rows stay one shape", () => {
  assert.equal(excerpt("a\n\n  b\tc", "a"), "a b c");
});
