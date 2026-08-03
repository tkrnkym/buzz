import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_PREFS,
  prefsStorageKey,
  readPrefs,
  shouldAnnounce,
  writePrefs,
} from "@/features/notifications/notification-prefs";

const ME = "1a".repeat(32);

/** A minimal localStorage, since these tests run in Node. */
function installStorage(seed = {}) {
  const store = new Map(Object.entries(seed));
  globalThis.localStorage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  };
  return store;
}

test("preferences are keyed by identity", () => {
  assert.notEqual(prefsStorageKey(ME), prefsStorageKey("other"));
  // A reader with no key still gets a stable slot rather than a crash.
  assert.ok(prefsStorageKey(null).endsWith("anonymous"));
});

test("nothing stored means the quiet defaults", () => {
  installStorage();
  assert.deepEqual(readPrefs(ME), DEFAULT_PREFS);
  // Quiet is the safe direction: a client that announced by default would start
  // making noise on a machine nobody asked.
  assert.equal(DEFAULT_PREFS.desktop, false);
  assert.equal(DEFAULT_PREFS.sound, false);
});

test("a stored blob missing a newer field keeps that field's default", () => {
  installStorage({
    [prefsStorageKey(ME)]: JSON.stringify({
      categories: { mention: false },
      sound: true,
    }),
  });
  const prefs = readPrefs(ME);
  assert.equal(prefs.categories.mention, false);
  // Added after the blob was written: enabled, not undefined.
  assert.equal(prefs.categories.reply, true);
  assert.equal(prefs.sound, true);
  assert.equal(prefs.desktop, false);
});

test("corrupt storage falls back to the defaults rather than throwing", () => {
  installStorage({ [prefsStorageKey(ME)]: "{not json" });
  assert.deepEqual(readPrefs(ME), DEFAULT_PREFS);
});

test("a write is read back", () => {
  installStorage();
  const next = { ...DEFAULT_PREFS, sound: true, onlyWhenHidden: false };
  writePrefs(ME, next);
  assert.deepEqual(readPrefs(ME), next);
});

test("a disabled category announces nothing", () => {
  assert.equal(
    shouldAnnounce({
      category: "reply",
      documentHidden: true,
      prefs: {
        ...DEFAULT_PREFS,
        sound: true,
        categories: { ...DEFAULT_PREFS.categories, reply: false },
      },
    }),
    false,
  );
});

test("with only-when-hidden on, a visible tab announces nothing", () => {
  const prefs = { ...DEFAULT_PREFS, sound: true };
  assert.equal(
    shouldAnnounce({ category: "dm", documentHidden: false, prefs }),
    false,
  );
  assert.equal(
    shouldAnnounce({ category: "dm", documentHidden: true, prefs }),
    true,
  );
});

test("turning only-when-hidden off announces in the foreground too", () => {
  assert.equal(
    shouldAnnounce({
      category: "dm",
      documentHidden: false,
      prefs: { ...DEFAULT_PREFS, sound: true, onlyWhenHidden: false },
    }),
    true,
  );
});

test("with neither sound nor desktop there is nothing to announce with", () => {
  assert.equal(
    shouldAnnounce({
      category: "mention",
      documentHidden: true,
      prefs: DEFAULT_PREFS,
    }),
    false,
  );
});
