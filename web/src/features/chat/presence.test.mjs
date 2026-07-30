import assert from "node:assert/strict";
import test from "node:test";

import {
  TYPING_TTL_MS,
  buildPresenceFilter,
  buildPresenceTemplate,
  buildTypingFilter,
  buildTypingTemplate,
  completeTyping,
  foldPresence,
  parsePresenceStatus,
  pruneTyping,
  registerTyping,
  typingList,
} from "@/features/chat/presence";

const ME = "aa".repeat(32);
const OTHER = "bb".repeat(32);
const CHANNEL = "chan-1";
const NOW = 1_700_000_000_000;
const NOW_SECONDS = Math.floor(NOW / 1000);

const typingEvent = (overrides = {}) => ({
  id: "t1",
  pubkey: OTHER,
  kind: 20002,
  created_at: NOW_SECONDS,
  tags: [["h", CHANNEL]],
  content: "",
  sig: "sig".padEnd(128, "0"),
  ...overrides,
});

const register = (state, event, extra = {}) =>
  registerTyping({
    state,
    event,
    channelId: CHANNEL,
    myPubkey: ME,
    now: NOW,
    latestMessageAt: new Map(),
    ...extra,
  });

test("the presence filter names both a kind and explicit authors", () => {
  // The relay only synthesizes presence for this exact shape; without authors
  // the query falls through to stored events, of which there are none.
  const filter = buildPresenceFilter([ME, OTHER]);
  assert.deepEqual(filter.kinds, [20001]);
  assert.deepEqual(filter.authors, [ME, OTHER]);
});

test("a presence heartbeat is channel-less", () => {
  // Presence is a property of the person, not of a room.
  assert.deepEqual(buildPresenceTemplate("online"), {
    kind: 20001,
    tags: [],
    content: "online",
  });
});

test("presence status reads both the bare and legacy encodings", () => {
  // The relay accepts either, so a client that understood one would show half
  // its users as unknown.
  assert.equal(parsePresenceStatus("online"), "online");
  assert.equal(parsePresenceStatus('{"status":"away"}'), "away");
  assert.equal(parsePresenceStatus("  online  "), "online");
  assert.equal(parsePresenceStatus("{not json"), "{not json");
});

test("foldPresence keeps the newest status per author", () => {
  const presence = (pubkey, content, createdAt) => ({
    id: `${pubkey}-${createdAt}`,
    pubkey,
    kind: 20001,
    created_at: createdAt,
    tags: [],
    content,
    sig: "sig".padEnd(128, "0"),
  });

  const folded = foldPresence([
    presence(OTHER, "online", 100),
    presence(OTHER, "away", 200),
    presence(ME, "online", 150),
    // An out-of-order delivery must not resurrect an older status.
    presence(OTHER, "online", 50),
  ]);

  assert.equal(folded.get(OTHER).status, "away");
  assert.equal(folded.get(ME).status, "online");
});

test("the typing filter is scoped to one channel", () => {
  assert.deepEqual(buildTypingFilter(CHANNEL), {
    kinds: [20002],
    "#h": [CHANNEL],
  });
});

test("a typing announcement carries thread tags when replying", () => {
  assert.deepEqual(buildTypingTemplate(CHANNEL).tags, [["h", CHANNEL]]);

  // Direct reply: root === parent collapses to one marked tag, as in buzz-sdk.
  assert.deepEqual(
    buildTypingTemplate(CHANNEL, { rootId: "r1", parentId: "r1" }).tags,
    [
      ["h", CHANNEL],
      ["e", "r1", "", "reply"],
    ],
  );
  assert.deepEqual(
    buildTypingTemplate(CHANNEL, { rootId: "r1", parentId: "p2" }).tags,
    [
      ["h", CHANNEL],
      ["e", "r1", "", "root"],
      ["e", "p2", "", "reply"],
    ],
  );
});

test("registerTyping records a live typist", () => {
  const state = register(new Map(), typingEvent());
  assert.equal(state.size, 1);
  const [entry] = typingList(state);
  assert.equal(entry.pubkey, OTHER);
  assert.equal(entry.threadHeadId, null);
  assert.equal(entry.expiresAt, NOW + TYPING_TTL_MS);
});

test("the reader's own typing is never shown back to them", () => {
  const state = register(new Map(), typingEvent({ pubkey: ME }));
  assert.equal(state.size, 0);
});

test("typing from another channel is ignored", () => {
  const state = register(new Map(), typingEvent({ tags: [["h", "other"]] }));
  assert.equal(state.size, 0);
});

test("an already-expired typing event is dropped", () => {
  // Late delivery of an old indicator must not resurrect it.
  const stale = typingEvent({
    created_at: NOW_SECONDS - TYPING_TTL_MS / 1000 - 1,
  });
  assert.equal(register(new Map(), stale).size, 0);
});

test("typing at or before the author's newest message is stale", () => {
  // The indicator published just before a message often arrives just after it.
  const latestMessageAt = new Map([[`${OTHER}:channel`, NOW_SECONDS]]);
  const state = register(new Map(), typingEvent(), { latestMessageAt });
  assert.equal(state.size, 0);

  const newer = register(
    new Map(),
    typingEvent({ created_at: NOW_SECONDS + 1 }),
    {
      latestMessageAt,
    },
  );
  assert.equal(newer.size, 1);
});

test("channel typing and thread typing are tracked separately", () => {
  let state = register(new Map(), typingEvent({ id: "a" }));
  state = register(
    state,
    typingEvent({
      id: "b",
      tags: [
        ["h", CHANNEL],
        ["e", "root-1", "", "reply"],
      ],
    }),
  );

  assert.equal(state.size, 2);
  assert.deepEqual(
    typingList(state).map((entry) => entry.threadHeadId),
    [null, "root-1"],
  );
});

test("re-announcing keeps the original first-seen order", () => {
  let state = register(new Map(), typingEvent({ id: "a", pubkey: OTHER }));
  const third = "cc".repeat(32);
  state = register(state, typingEvent({ id: "b", pubkey: third }));
  // A refresh from the first typist must not push them behind the second.
  state = registerTyping({
    state,
    event: typingEvent({ id: "c", pubkey: OTHER, created_at: NOW_SECONDS + 1 }),
    channelId: CHANNEL,
    myPubkey: ME,
    now: NOW + 500,
    latestMessageAt: new Map(),
  });

  assert.deepEqual(
    typingList(state).map((entry) => entry.pubkey),
    [OTHER, third],
  );
});

test("pruneTyping drops expiries and keeps identity when nothing expired", () => {
  const state = register(new Map(), typingEvent());
  assert.equal(
    pruneTyping(state, NOW + 1_000),
    state,
    "no change, same object",
  );
  assert.equal(pruneTyping(state, NOW + TYPING_TTL_MS + 1).size, 0);
});

test("completeTyping clears the typist whose message arrived", () => {
  const state = register(new Map(), typingEvent());
  const cleared = completeTyping(state, { pubkey: OTHER, threadHeadId: null });
  assert.equal(cleared.size, 0);
  // Unknown typist: same object back, so React can skip.
  assert.equal(
    completeTyping(state, { pubkey: "dd".repeat(32), threadHeadId: null }),
    state,
  );
});
