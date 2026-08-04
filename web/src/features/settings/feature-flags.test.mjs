import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_FLAGS,
  FEATURE_FLAGS,
  readFlags,
} from "@/features/settings/feature-flags";

test("every flag is on by default, because everything listed already ships", () => {
  for (const flag of FEATURE_FLAGS) {
    assert.equal(DEFAULT_FLAGS[flag.id], true, flag.id);
  }
});

test("every flag has a label and an explanation", () => {
  for (const flag of FEATURE_FLAGS) {
    assert.ok(flag.label, flag.id);
    assert.ok(flag.description, flag.id);
  }
});

test("a stored blob is merged field by field", () => {
  const stored = readFlags(JSON.stringify({ projects: false }));
  assert.equal(stored.projects, false);
  // A flag written before it existed comes back on: a section appearing is
  // recoverable, a section silently missing is the bug nobody reports.
  assert.equal(stored.pulse, true);
});

test("junk in the store does not take a section away", () => {
  assert.deepEqual(readFlags("not json"), DEFAULT_FLAGS);
  assert.deepEqual(readFlags(null), DEFAULT_FLAGS);
  // A non-boolean is ignored rather than coerced — "false" is a string, and
  // treating it as truthy or falsy are both guesses.
  assert.equal(readFlags(JSON.stringify({ forum: "false" })).forum, true);
});
