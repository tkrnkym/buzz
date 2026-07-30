import assert from "node:assert/strict";
import test from "node:test";

import {
  dimensionsFromDim,
  parseImetaTags,
} from "@/shared/ui/markdown/parse-imeta";

test("parseImetaTags reads one attachment's fields", () => {
  const entries = parseImetaTags([
    ["h", "chan-1"],
    [
      "imeta",
      "url https://media.example/abc.png",
      "m image/png",
      "x deadbeef",
      "size 2048",
      "dim 800x600",
      "blurhash LEHV6n",
      "alt a screenshot of the timeline",
    ],
  ]);

  assert.equal(entries.size, 1);
  assert.deepEqual(entries.get("https://media.example/abc.png"), {
    url: "https://media.example/abc.png",
    m: "image/png",
    x: "deadbeef",
    size: 2048,
    dim: "800x600",
    blurhash: "LEHV6n",
    // Values may contain spaces, so only the first separator splits.
    alt: "a screenshot of the timeline",
  });
});

test("parseImetaTags keys multiple attachments by url", () => {
  const entries = parseImetaTags([
    ["imeta", "url https://media.example/one.png", "m image/png"],
    [
      "imeta",
      "url https://media.example/two.mp4",
      "m video/mp4",
      "duration 12.5",
    ],
  ]);

  assert.deepEqual(
    [...entries.keys()],
    ["https://media.example/one.png", "https://media.example/two.mp4"],
  );
  assert.equal(entries.get("https://media.example/two.mp4").duration, 12.5);
});

test("parseImetaTags drops an entry with no url", () => {
  // Without a url there is nothing to key the metadata against.
  assert.equal(parseImetaTags([["imeta", "m image/png", "dim 10x10"]]).size, 0);
});

test("parseImetaTags keeps an attachment carrying unknown keys", () => {
  // NIP-92 lets producers add their own keys; dropping the entry would lose an
  // attachment the reader can otherwise see.
  const entries = parseImetaTags([
    ["imeta", "url https://media.example/a.png", "future-key whatever"],
  ]);
  assert.equal(entries.size, 1);
});

test("parseImetaTags ignores malformed parts", () => {
  const entries = parseImetaTags([
    ["imeta", "url https://media.example/a.png", "novalue"],
  ]);
  assert.equal(
    entries.get("https://media.example/a.png").url,
    "https://media.example/a.png",
  );
});

test("dimensionsFromDim parses WxH and rejects nonsense", () => {
  assert.deepEqual(dimensionsFromDim("800x600"), { width: 800, height: 600 });
  assert.equal(dimensionsFromDim(undefined), undefined);
  assert.equal(dimensionsFromDim("800"), undefined);
  assert.equal(dimensionsFromDim("wide x tall"), undefined);
  // A zero axis would reserve a collapsed box, which is worse than none.
  assert.equal(dimensionsFromDim("0x600"), undefined);
  assert.equal(dimensionsFromDim("800x0"), undefined);
});
