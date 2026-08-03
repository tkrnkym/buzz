import assert from "node:assert/strict";
import test from "node:test";

import { resolveShellView } from "./shell-view.ts";

test("the index and the channel routes are chat", () => {
  assert.equal(resolveShellView("/"), "chat");
  assert.equal(resolveShellView("/c"), "chat");
  assert.equal(
    resolveShellView("/c/11111111-1111-1111-1111-111111111111"),
    "chat",
  );
});

test("each section owns its prefix", () => {
  assert.equal(resolveShellView("/home"), "inbox");
  assert.equal(resolveShellView("/settings"), "settings");
  assert.equal(resolveShellView("/browse"), "browse");
  assert.equal(resolveShellView("/agents"), "agents");
  assert.equal(resolveShellView("/projects"), "projects");
  assert.equal(resolveShellView("/projects/project-nuxx"), "projects");
  assert.equal(resolveShellView("/workflows/wf-release"), "workflows");
});

test("an unknown path is not silently chat", () => {
  // The old default lit the Channels item up on every new section.
  assert.equal(resolveShellView("/repos"), "other");
  assert.equal(resolveShellView("/invite/abc"), "other");
});

test("a prefix only matches on a segment boundary", () => {
  // `/homework` is not the inbox.
  assert.equal(resolveShellView("/homework"), "other");
  assert.equal(resolveShellView("/agentsmith"), "other");
});
