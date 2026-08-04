import assert from "node:assert/strict";
import test from "node:test";

import {
  addHarness,
  removeCustomHarness,
} from "@/features/harness/harness-mutations";

const base = () => ({
  harnesses: [
    {
      id: "sprig",
      name: "sprig",
      command: "sprig",
      version: "0.4.1",
      available: true,
      installUrl: "https://example.jp",
    },
    {
      id: "missing",
      name: "missing-one",
      command: "missing-one",
      version: null,
      available: false,
      installUrl: "https://example.jp",
    },
  ],
});

test("a harness the reader added is listed as theirs and as available", () => {
  // The browser cannot probe for a local binary, so no version is claimed — but a
  // command the reader just described, listed as "not found", would be the client
  // contradicting them about their own machine.
  const next = addHarness(base(), {
    id: "mine",
    name: "My CLI",
    command: "my-agent --acp",
  });
  const added = next.harnesses.at(-1);
  assert.equal(added.name, "My CLI");
  assert.equal(added.custom, true);
  assert.equal(added.available, true);
  assert.equal(added.version, null);
});

test("only a harness the reader added can be removed", () => {
  const withCustom = addHarness(base(), {
    id: "mine",
    name: "My CLI",
    command: "my-agent",
  });
  assert.equal(removeCustomHarness(withCustom, "mine").harnesses.length, 2);
  // The shipped catalog states what exists. Removing an uninstalled entry from it
  // would turn "not installed" into "does not exist".
  assert.equal(removeCustomHarness(withCustom, "missing").harnesses.length, 3);
  assert.equal(removeCustomHarness(withCustom, "sprig").harnesses.length, 3);
});
