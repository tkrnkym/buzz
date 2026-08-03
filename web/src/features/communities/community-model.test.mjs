import assert from "node:assert/strict";
import test from "node:test";

import {
  extractInviteCode,
  hostedNameError,
  hostedRelayUrl,
  inviteCodeError,
  normalizeRelayUrl,
  relayUrlError,
} from "@/features/communities/community-model";

test("a bare host becomes an encrypted WebSocket URL", () => {
  // Guessing ws:// would silently downgrade someone's connection.
  assert.equal(normalizeRelayUrl("relay.example.jp"), "wss://relay.example.jp");
});

test("http and https are rewritten to their WebSocket equivalents", () => {
  assert.equal(normalizeRelayUrl("https://a.example"), "wss://a.example");
  assert.equal(normalizeRelayUrl("http://a.example"), "ws://a.example");
});

test("an explicit ws:// is left alone", () => {
  // Someone who typed it in full meant it — usually a relay on localhost.
  assert.equal(normalizeRelayUrl("ws://localhost:3000"), "ws://localhost:3000");
});

test("a trailing slash is not part of a relay's identity", () => {
  assert.equal(normalizeRelayUrl("wss://a.example/"), "wss://a.example");
  assert.equal(normalizeRelayUrl("wss://a.example///"), "wss://a.example");
});

test("whitespace and an empty string are handled without throwing", () => {
  assert.equal(normalizeRelayUrl("  wss://a.example  "), "wss://a.example");
  assert.equal(normalizeRelayUrl("   "), "");
});

test("a usable relay URL has no error", () => {
  assert.equal(relayUrlError("relay.example.jp"), null);
  assert.equal(relayUrlError("wss://relay.example.jp:8443/nostr"), null);
});

test("an empty, unparseable, or query-carrying URL is refused with a reason", () => {
  assert.match(relayUrlError(""), /入力/);
  // A copied browser address rather than an endpoint.
  assert.match(relayUrlError("wss://a.example?token=1"), /クエリ/);
  assert.match(relayUrlError("wss://a.example#frag"), /クエリ/);
});

test("a hosted name is lowercase alphanumeric with inner hyphens", () => {
  assert.equal(hostedNameError("my-team"), null);
  assert.equal(hostedNameError("team2"), null);
  assert.match(hostedNameError(""), /入力/);
  assert.match(hostedNameError("ab"), /3文字/);
  assert.match(hostedNameError("a".repeat(33)), /32文字/);
  // Case is normalized rather than refused: a hostname label is
  // case-insensitive, so rejecting "My-Team" would be pedantic.
  assert.equal(hostedNameError("My-Team"), null);
  // A leading or trailing hyphen is not a legal hostname label.
  assert.match(hostedNameError("-team"), /英小文字/);
  assert.match(hostedNameError("team-"), /英小文字/);
});

test("a hosted community's URL follows from its name", () => {
  assert.equal(hostedRelayUrl(" My-Team "), "wss://my-team.nuxx.host");
});

test("an invite code is checked loosely, because the relay decides", () => {
  assert.equal(inviteCodeError("abc123"), null);
  assert.match(inviteCodeError(""), /入力/);
  assert.match(inviteCodeError("ab"), /短/);
});

test("a code is pulled out of a pasted link", () => {
  assert.equal(
    extractInviteCode("https://nuxx.example/invite/abc123"),
    "abc123",
  );
  // A query parameter wins over the path, since that is the more explicit form.
  assert.equal(
    extractInviteCode("https://nuxx.example/join?code=xyz789"),
    "xyz789",
  );
  assert.equal(extractInviteCode("nuxx://invite/deadbeef"), "deadbeef");
});

test("a bare code passes through untouched", () => {
  assert.equal(extractInviteCode("  abc123  "), "abc123");
});

test("a malformed link falls back to the whole input", () => {
  // Refusing it would leave the holder of a valid code with no way in.
  assert.equal(extractInviteCode("https://"), "https://");
});
