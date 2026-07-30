import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMessageLink,
  isMessageLink,
  parseMessageLink,
  resolveMessageLinkRenderTarget,
} from "@/features/chat/message-link";

const CHANNEL = "11111111-1111-1111-1111-111111111111";
const MESSAGE = "a".repeat(64);

test("buildMessageLink round-trips through parseMessageLink", () => {
  const url = buildMessageLink({ channelId: CHANNEL, messageId: MESSAGE });
  const parsed = parseMessageLink(url);
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.value, {
    channelId: CHANNEL,
    messageId: MESSAGE,
    threadRootId: null,
  });
});

test("buildMessageLink carries an optional thread root", () => {
  const root = "b".repeat(64);
  const url = buildMessageLink({
    channelId: CHANNEL,
    messageId: MESSAGE,
    threadRootId: root,
  });
  assert.equal(parseMessageLink(url).value.threadRootId, root);
});

test("buildMessageLink treats an empty thread root as absent", () => {
  // Callers pass a resolved thread root straight through, which is "" when the
  // message is not a reply.
  const url = buildMessageLink({
    channelId: CHANNEL,
    messageId: MESSAGE,
    threadRootId: "",
  });
  assert.ok(!url.includes("thread="));
});

test("buildMessageLink rejects missing identifiers", () => {
  assert.throws(() => buildMessageLink({ channelId: "", messageId: MESSAGE }));
  assert.throws(() => buildMessageLink({ channelId: CHANNEL, messageId: "" }));
});

test("parseMessageLink reports why a link is unusable", () => {
  // A result rather than a throw, so one bad link renders as text instead of
  // breaking the whole message.
  assert.deepEqual(parseMessageLink("not a url"), {
    ok: false,
    reason: "invalid-url",
  });
  assert.equal(parseMessageLink("https://example.com").reason, "wrong-scheme");
  assert.equal(parseMessageLink("buzz://channel?x=1").reason, "wrong-host");
  assert.equal(
    parseMessageLink(`buzz://message?id=${MESSAGE}`).reason,
    "missing-channel",
  );
  assert.equal(
    parseMessageLink(`buzz://message?channel=${CHANNEL}`).reason,
    "missing-id",
  );
});

test("isMessageLink is a cheap pre-check", () => {
  assert.equal(isMessageLink(`buzz://message?channel=${CHANNEL}`), true);
  assert.equal(isMessageLink("buzz://message"), true);
  assert.equal(isMessageLink("buzz://other?channel=x"), false);
  assert.equal(isMessageLink("https://example.com"), false);
  assert.equal(isMessageLink(undefined), false);
  assert.equal(isMessageLink(null), false);
});

test("an autolink renders as a pill and a labelled link keeps its label", () => {
  const href = buildMessageLink({ channelId: CHANNEL, messageId: MESSAGE });

  // CommonMark autolink: label === href, so there is no author-written text.
  assert.equal(
    resolveMessageLinkRenderTarget({ href, label: href }).kind,
    "pill",
  );
  assert.equal(
    resolveMessageLinkRenderTarget({ href, label: "see this" }).kind,
    "label",
  );
});

test("a malformed message link falls back to default link handling", () => {
  assert.equal(
    resolveMessageLinkRenderTarget({
      href: "buzz://message?channel=",
      label: "x",
    }).kind,
    "none",
  );
  assert.equal(
    resolveMessageLinkRenderTarget({
      href: "https://example.com",
      label: "x",
    }).kind,
    "none",
  );
});
