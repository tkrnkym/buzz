import assert from "node:assert/strict";
import test from "node:test";

import { harnessIcon } from "@/features/harness/harness-model";

const harness = (overrides) => ({
  id: "h1",
  name: "Claude Code",
  command: "claude",
  version: "1.0",
  available: true,
  installUrl: "https://example.com",
  ...overrides,
});

test("a known name gets its own icon, not the generic one", () => {
  assert.notEqual(
    harnessIcon(harness({ name: "Claude Code" })),
    harnessIcon(harness({ name: "Codex CLI" })),
  );
  assert.notEqual(
    harnessIcon(harness({ name: "Codex CLI" })),
    harnessIcon(harness({ name: "Gemini CLI" })),
  );
});

test("a custom harness gets something other than the bare default", () => {
  const custom = harnessIcon(harness({ name: "my-agent", custom: true }));
  const unknown = harnessIcon(harness({ name: "my-agent", custom: false }));
  assert.notEqual(custom, unknown);
});
