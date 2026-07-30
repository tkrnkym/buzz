import assert from "node:assert/strict";
import test from "node:test";

import { RelaySession } from "@/shared/api/relay-session";

/** Deterministic stand-in for a relay WebSocket. */
class FakeSocket {
  constructor(url) {
    this.url = url;
    this.sent = [];
    this.closed = false;
    this.onopen = null;
    this.onmessage = null;
    this.onclose = null;
    this.onerror = null;
  }

  send(data) {
    this.sent.push(JSON.parse(data));
  }

  close() {
    this.closed = true;
  }

  /** Drive the handshake to the point where the relay would challenge. */
  open() {
    this.onopen?.();
  }

  emit(message) {
    this.onmessage?.(JSON.stringify(message));
  }

  drop() {
    this.onclose?.();
  }

  /** Messages of one NIP-01 verb, in send order. */
  ofType(type) {
    return this.sent.filter((message) => message[0] === type);
  }
}

/** Signer that stamps a predictable id so tests can match OK frames. */
function fakeSigner({ failSigning = false } = {}) {
  let counter = 0;
  return {
    kind: "ephemeral",
    durable: false,
    getPublicKey: async () => "pub".padEnd(64, "0"),
    sign: async (template) => {
      if (failSigning) {
        throw new Error("user declined");
      }
      counter += 1;
      return {
        ...template,
        created_at: template.created_at ?? 1_700_000_000,
        id: `event-${counter}`,
        pubkey: "pub".padEnd(64, "0"),
        sig: "sig".padEnd(128, "0"),
      };
    },
  };
}

/**
 * Build a session wired to fake sockets.
 *
 * Timers are real but effectively zero, and `random` is pinned so the backoff
 * ceiling is deterministic.
 */
function harness(options = {}) {
  const sockets = [];
  const warnings = [];
  const session = new RelaySession({
    url: "wss://relay.test",
    signer: options.signer ?? fakeSigner(),
    socketFactory: (url) => {
      const socket = new FakeSocket(url);
      sockets.push(socket);
      return socket;
    },
    backoffBaseMs: 1,
    backoffMaxMs: 1,
    authGraceMs: 1,
    random: () => 1,
    onWarning: (message, detail) => warnings.push({ message, detail }),
    ...options,
  });
  return { session, sockets, warnings };
}

/** Let queued microtasks and ~zero-delay timers run. */
const settle = (ms = 5) => new Promise((resolve) => setTimeout(resolve, ms));

/** Walk a fresh session through NIP-42 to the ready state. */
async function connectAndAuthenticate(h) {
  h.session.connect();
  const socket = h.sockets.at(-1);
  socket.open();
  socket.emit(["AUTH", "challenge-1"]);
  await settle();
  const authFrame = socket.ofType("AUTH")[0];
  socket.emit(["OK", authFrame[1].id, true, ""]);
  await settle();
  return socket;
}

test("authenticates with NIP-42 and reaches ready", async () => {
  const h = harness();
  const socket = await connectAndAuthenticate(h);

  const authFrames = socket.ofType("AUTH");
  assert.equal(authFrames.length, 1);
  assert.equal(authFrames[0][1].id, "event-1");
  assert.equal(h.session.getState(), "ready");
});

test("proceeds unauthenticated when the relay never challenges", async () => {
  const h = harness();
  h.session.connect();
  h.sockets[0].open();
  await settle();

  assert.equal(h.session.getState(), "ready");
  assert.equal(h.sockets[0].ofType("AUTH").length, 0);
});

test("stays up unauthenticated when signing the challenge fails", async () => {
  const h = harness({ signer: fakeSigner({ failSigning: true }) });
  h.session.connect();
  h.sockets[0].open();
  h.sockets[0].emit(["AUTH", "challenge-1"]);
  await settle();

  assert.equal(h.session.getState(), "ready");
  assert.equal(h.warnings.length, 1);
  assert.match(h.warnings[0].message, /AUTH signing failed/);
});

test("a subscription opened before ready is sent once authenticated", async () => {
  const h = harness();
  const received = [];
  h.session.subscribe(
    { kinds: [9], "#h": ["chan"] },
    {
      onEvent: (event) => received.push(event.id),
    },
  );

  const socket = h.sockets.at(-1);
  // The REQ must wait for AUTH: sending it earlier would be refused by the gate.
  assert.equal(socket.ofType("REQ").length, 0);

  socket.open();
  socket.emit(["AUTH", "challenge-1"]);
  await settle();
  socket.emit(["OK", socket.ofType("AUTH")[0][1].id, true, ""]);
  await settle();

  const reqs = socket.ofType("REQ");
  assert.equal(reqs.length, 1);
  assert.deepEqual(reqs[0][2], { kinds: [9], "#h": ["chan"] });

  socket.emit(["EVENT", reqs[0][1], { id: "abc" }]);
  assert.deepEqual(received, ["abc"]);
});

test("unsubscribe sends CLOSE and stops dispatching", async () => {
  const h = harness();
  const socket = await connectAndAuthenticate(h);
  const received = [];
  const unsubscribe = h.session.subscribe(
    { kinds: [9] },
    { onEvent: (event) => received.push(event.id) },
  );
  const subId = socket.ofType("REQ")[0][1];

  unsubscribe();
  assert.deepEqual(socket.ofType("CLOSE")[0], ["CLOSE", subId]);

  socket.emit(["EVENT", subId, { id: "ignored" }]);
  assert.deepEqual(received, []);
});

test("query resolves stored events at EOSE", async () => {
  const h = harness();
  const socket = await connectAndAuthenticate(h);

  const pending = h.session.query({ kinds: [39000] });
  const subId = socket.ofType("REQ")[0][1];
  socket.emit(["EVENT", subId, { id: "a" }]);
  socket.emit(["EVENT", subId, { id: "b" }]);
  socket.emit(["EOSE", subId]);

  const events = await pending;
  assert.deepEqual(
    events.map((event) => event.id),
    ["a", "b"],
  );
  // EOSE ends the read, so the subscription is closed rather than left live.
  assert.deepEqual(socket.ofType("CLOSE")[0], ["CLOSE", subId]);
});

test("CLOSED reports the relay reason and is not replayed on reconnect", async () => {
  const h = harness();
  const socket = await connectAndAuthenticate(h);

  const closures = [];
  h.session.subscribe(
    { kinds: [9] },
    { onEvent: () => {}, onClosed: (reason) => closures.push(reason) },
  );
  const subId = socket.ofType("REQ")[0][1];
  socket.emit(["CLOSED", subId, "auth-required: restricted"]);

  assert.deepEqual(closures, ["auth-required: restricted"]);

  socket.drop();
  await settle();
  const reconnected = h.sockets.at(-1);
  reconnected.open();
  reconnected.emit(["AUTH", "challenge-2"]);
  await settle();
  reconnected.emit(["OK", reconnected.ofType("AUTH")[0][1].id, true, ""]);
  await settle();

  // A filter the relay already refused must not come back automatically.
  assert.equal(reconnected.ofType("REQ").length, 0);
});

test("live subscriptions are replayed after a reconnect", async () => {
  const h = harness();
  const socket = await connectAndAuthenticate(h);
  h.session.subscribe({ kinds: [9], "#h": ["chan"] }, { onEvent: () => {} });

  socket.drop();
  await settle();
  assert.equal(h.sockets.length, 2);

  const reconnected = h.sockets[1];
  reconnected.open();
  reconnected.emit(["AUTH", "challenge-2"]);
  await settle();
  reconnected.emit(["OK", reconnected.ofType("AUTH")[0][1].id, true, ""]);
  await settle();

  const reqs = reconnected.ofType("REQ");
  assert.equal(reqs.length, 1);
  assert.deepEqual(reqs[0][2], { kinds: [9], "#h": ["chan"] });
  assert.equal(h.session.getState(), "ready");
});

test("publish resolves on OK and rejects on a relay refusal", async () => {
  const h = harness();
  const socket = await connectAndAuthenticate(h);

  const accepted = h.session.publish({ kind: 9, tags: [], content: "hi" });
  await settle();
  const firstEvent = socket.ofType("EVENT")[0][1];
  socket.emit(["OK", firstEvent.id, true, ""]);
  const event = await accepted;
  assert.equal(event.content, "hi");

  const refused = h.session.publish({ kind: 9, tags: [], content: "nope" });
  await settle();
  const secondEvent = socket.ofType("EVENT")[1][1];
  socket.emit(["OK", secondEvent.id, false, "blocked: not a member"]);
  await assert.rejects(refused, /blocked: not a member/);
});

test("a publish issued before ready is queued, not dropped", async () => {
  const h = harness();
  const pending = h.session.publish({ kind: 9, tags: [], content: "queued" });
  await settle();

  const socket = h.sockets.at(-1);
  assert.equal(socket.ofType("EVENT").length, 0);

  socket.open();
  socket.emit(["AUTH", "challenge-1"]);
  await settle();
  socket.emit(["OK", socket.ofType("AUTH")[0][1].id, true, ""]);
  await settle();

  const events = socket.ofType("EVENT");
  assert.equal(events.length, 1);
  socket.emit(["OK", events[0][1].id, true, ""]);
  assert.equal((await pending).content, "queued");
});

test("a sent publish whose OK is lost to a disconnect rejects", async () => {
  const h = harness();
  const socket = await connectAndAuthenticate(h);

  const inFlight = h.session.publish({ kind: 9, tags: [], content: "lost" });
  await settle();
  assert.equal(socket.ofType("EVENT").length, 1);

  socket.drop();
  await assert.rejects(inFlight, /Connection lost before the relay confirmed/);
});

test("close() tears down without reconnecting", async () => {
  const h = harness();
  const socket = await connectAndAuthenticate(h);

  h.session.close();
  assert.equal(socket.closed, true);
  assert.equal(h.session.getState(), "closed");

  await settle();
  assert.equal(h.sockets.length, 1);
});

test("close() rejects queued publishes instead of leaving them pending", async () => {
  const h = harness();
  await connectAndAuthenticate(h);

  const pending = h.session.publish({
    kind: 9,
    tags: [],
    content: "abandoned",
  });
  await settle();
  h.session.close();

  await assert.rejects(pending, /Relay session closed/);
});

test("state transitions are observable", async () => {
  const h = harness();
  const states = [];
  h.session.onStateChange((state) => states.push(state));

  const socket = await connectAndAuthenticate(h);
  socket.drop();
  await settle();

  assert.deepEqual(states.slice(0, 3), [
    "connecting",
    "authenticating",
    "ready",
  ]);
  assert.ok(states.includes("reconnecting"));
});
