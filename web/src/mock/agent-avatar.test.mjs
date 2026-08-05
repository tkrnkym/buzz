import assert from "node:assert/strict";
import test from "node:test";

import { agentAvatarUrl } from "@/mock/agent-avatar";

test("the same agent always gets the same avatar", () => {
  assert.equal(agentAvatarUrl("agent-triage"), agentAvatarUrl("agent-triage"));
});

test("different agents can get different avatars", () => {
  const ids = ["agent-triage", "agent-release", "agent-reviewer", "agent-x"];
  const urls = new Set(ids.map(agentAvatarUrl));
  assert.ok(urls.size > 1);
});

test("the result is a data URI an <img> can render directly", () => {
  assert.match(agentAvatarUrl("agent-triage"), /^data:image\/svg\+xml,/);
});
