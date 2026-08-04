import assert from "node:assert/strict";
import test from "node:test";

import {
  activeEmojiQuery,
  emojiInsertText,
  buildEmojiCatalog,
  buildEmojiFilters,
  buildEmojiSetTemplate,
  emojiFromEvent,
  emojiTagsForContent,
  isShortcode,
  shortcodeFromFilename,
  MY_EMOJI_SET_D_TAG,
  searchEmoji,
  shortcodesIn,
} from "./emoji-model.ts";

const ME = "a".repeat(64);
const THEM = "b".repeat(64);

function emojiSet(pubkey, d, entries, createdAt = 1000) {
  return {
    id: `${d}${pubkey}`.padEnd(64, "0").slice(0, 64),
    pubkey,
    kind: 30030,
    created_at: createdAt,
    tags: [["d", d], ...entries.map(([code, url]) => ["emoji", code, url])],
    content: "",
    sig: "f".repeat(128),
  };
}

test("a shortcode is lowercase word characters", () => {
  assert.equal(isShortcode("ship_it2"), true);
  assert.equal(isShortcode("Ship"), false);
  assert.equal(isShortcode("ship it"), false);
  assert.equal(isShortcode(""), false);
});

test("one filter covers both the list and the sets", () => {
  const [filter] = buildEmojiFilters([ME, THEM, ME]);
  assert.deepEqual(filter.kinds, [10030, 30030]);
  assert.deepEqual(filter.authors, [ME, THEM]);
});

test("no authors means no query at all", () => {
  assert.deepEqual(buildEmojiFilters([]), []);
});

test("an emoji tag without a URL is dropped", () => {
  const parsed = emojiFromEvent(
    emojiSet(ME, "pack", [
      ["good", "https://example.com/good.png"],
      ["bad", ""],
    ]),
  );
  assert.deepEqual(
    parsed.map((emoji) => emoji.shortcode),
    ["good"],
  );
  assert.equal(parsed[0].pack, "pack");
  assert.equal(parsed[0].author, ME);
});

test("a kind:10030 entry belongs to no pack", () => {
  const [emoji] = emojiFromEvent({
    id: "c".repeat(64),
    pubkey: ME,
    kind: 10030,
    created_at: 1,
    tags: [["emoji", "wave", "https://example.com/wave.png"]],
    content: "",
    sig: "f".repeat(128),
  });
  assert.equal(emoji.pack, null);
});

test("the catalog is the union of everyone's sets", () => {
  const catalog = buildEmojiCatalog({
    events: [
      emojiSet(ME, "mine", [["a", "https://example.com/a.png"]]),
      emojiSet(THEM, "theirs", [["b", "https://example.com/b.png"]]),
    ],
    selfPubkey: ME,
  });
  assert.deepEqual(Object.keys(catalog).sort(), ["a", "b"]);
});

test("the reader's own definition wins a collision", () => {
  // Theirs is older, so "oldest wins" alone would pick it.
  const catalog = buildEmojiCatalog({
    events: [
      emojiSet(THEM, "theirs", [["x", "https://example.com/theirs.png"]], 100),
      emojiSet(ME, "mine", [["x", "https://example.com/mine.png"]], 900),
    ],
    selfPubkey: ME,
  });
  assert.equal(catalog.x.url, "https://example.com/mine.png");
});

test("between two strangers the oldest definition wins", () => {
  const catalog = buildEmojiCatalog({
    events: [
      emojiSet(THEM, "late", [["x", "https://example.com/late.png"]], 900),
      emojiSet(
        "c".repeat(64),
        "early",
        [["x", "https://example.com/early.png"]],
        100,
      ),
    ],
    selfPubkey: ME,
  });
  assert.equal(catalog.x.url, "https://example.com/early.png");
});

test("search puts prefix matches first", () => {
  const catalog = buildEmojiCatalog({
    events: [
      emojiSet(ME, "mine", [
        ["party_parrot", "https://example.com/1.png"],
        ["parrot", "https://example.com/2.png"],
        ["not_a_parrot", "https://example.com/3.png"],
      ]),
    ],
  });
  assert.deepEqual(
    searchEmoji(catalog, "parrot").map((emoji) => emoji.shortcode),
    // Prefix match first; the two contained matches then sort alphabetically.
    ["parrot", "not_a_parrot", "party_parrot"],
  );
});

test("a leading colon is ignored when searching", () => {
  const catalog = buildEmojiCatalog({
    events: [emojiSet(ME, "mine", [["wave", "https://example.com/w.png"]])],
  });
  assert.equal(searchEmoji(catalog, ":wav").length, 1);
});

test("shortcodes are found in order", () => {
  assert.deepEqual(shortcodesIn("hi :wave: and :ship_it: too"), [
    "wave",
    "ship_it",
  ]);
});

test("only shortcodes actually used are tagged, once each", () => {
  const catalog = buildEmojiCatalog({
    events: [
      emojiSet(ME, "mine", [
        ["wave", "https://example.com/wave.png"],
        ["unused", "https://example.com/unused.png"],
      ]),
    ],
  });
  assert.deepEqual(emojiTagsForContent(":wave: :wave: :unknown:", catalog), [
    ["emoji", "wave", "https://example.com/wave.png"],
  ]);
});

test("a colon mid-word does not open the picker", () => {
  assert.equal(activeEmojiQuery("https://ex", 10), null);
  assert.equal(activeEmojiQuery("12:30", 5), null);
});

test("two characters are needed before completing", () => {
  assert.equal(activeEmojiQuery("say :w", 6), null);
  assert.deepEqual(activeEmojiQuery("say :wa", 7), { query: "wa", from: 4 });
});

test("the reader's own set is one addressable event", () => {
  const template = buildEmojiSetTemplate([
    {
      shortcode: "wave",
      url: "https://example.com/w.png",
      author: ME,
      pack: null,
    },
  ]);
  assert.equal(template.kind, 30030);
  assert.deepEqual(template.tags, [
    ["d", MY_EMOJI_SET_D_TAG],
    ["emoji", "wave", "https://example.com/w.png"],
  ]);
});

test("a completed emoji is closed and followed by a space", () => {
  assert.equal(emojiInsertText("wave"), ":wave: ");
});

test("a shortcode is suggested from the filename", () => {
  // Retyping the name after picking the file is a step that exists only because
  // the client would not do it.
  assert.equal(shortcodeFromFilename("Party Parrot.PNG"), "party_parrot");
  assert.equal(shortcodeFromFilename("shipit_squirrel.gif"), "shipit_squirrel");
});

test("separators become underscores, because that is NIP-30's alphabet", () => {
  // A hyphenated shortcode is one this client could show and no other client
  // could, so the emoji we publish would be unusable elsewhere.
  assert.equal(shortcodeFromFilename("party-parrot.gif"), "party_parrot");
  assert.equal(shortcodeFromFilename("a.b.c.png"), "a_b_c");
});

test("a filename with nothing usable in it suggests nothing", () => {
  // An empty field, not a suggestion made of punctuation.
  assert.equal(shortcodeFromFilename("うんこ.png"), "");
  assert.equal(shortcodeFromFilename("---.png"), "");
  assert.equal(shortcodeFromFilename(".gitkeep"), "");
});
