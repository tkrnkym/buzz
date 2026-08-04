import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_THREAD_LAYOUT,
  isThreadLayout,
  readThreadLayout,
  showsTimelineBesideThread,
  THREAD_LAYOUTS,
} from "@/features/settings/thread-layout";

test("split is the default, because it keeps the room visible", () => {
  // A reply is usually about what someone else just said; hiding the room is what
  // makes a thread hard to read.
  assert.equal(DEFAULT_THREAD_LAYOUT, "split");
  assert.equal(readThreadLayout(null), "split");
  assert.equal(readThreadLayout(undefined), "split");
  assert.equal(readThreadLayout("garbage"), "split");
  assert.equal(readThreadLayout("full"), "full");
});

test("the layout decides one thing, and says which", () => {
  // The setting has a consumer rather than being a stored string nothing reads.
  assert.equal(showsTimelineBesideThread("split"), true);
  assert.equal(showsTimelineBesideThread("full"), false);
});

test("both options are offered, each with an explanation", () => {
  assert.deepEqual(
    THREAD_LAYOUTS.map((option) => option.value),
    ["split", "full"],
  );
  for (const option of THREAD_LAYOUTS) {
    assert.ok(option.hint, `${option.value} needs a hint`);
  }
});

test("only the two known values are accepted", () => {
  assert.equal(isThreadLayout("split"), true);
  assert.equal(isThreadLayout("inline"), false);
  assert.equal(isThreadLayout(null), false);
});
