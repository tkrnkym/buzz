import assert from "node:assert/strict";
import test from "node:test";

import {
  deployedScriptUrl,
  loadedScriptUrl,
  updateState,
} from "@/features/settings/update-check";

test("the entry script is what identifies the deployment", () => {
  // Vite hashes it by content, so a different filename is a different build.
  assert.equal(
    loadedScriptUrl([
      "http://x/@vite/client",
      "http://x/assets/index-CkGv3Lu9.js",
    ]),
    "http://x/assets/index-CkGv3Lu9.js",
  );
  // Other scripts on the page are not what the deployment is identified by.
  assert.equal(loadedScriptUrl(["http://x/analytics.js"]), null);
  assert.equal(loadedScriptUrl([]), null);
});

test("the served build is read out of the fetched html", () => {
  const html = `<!doctype html><script type="module" src="/assets/index-ABC123.js"></script>`;
  assert.equal(deployedScriptUrl(html), "/assets/index-ABC123.js");
  assert.equal(deployedScriptUrl("<html></html>"), null);
});

test("the same build is up to date, a different one is an update", () => {
  // Compared on the filename: the two are read through different bases, and the
  // hash is the part carrying the identity.
  assert.equal(
    updateState("http://x/assets/index-AAA.js", "/assets/index-AAA.js"),
    "current",
  );
  assert.equal(
    updateState("http://x/assets/index-AAA.js", "/assets/index-BBB.js"),
    "available",
  );
});

test("not being able to look is not the same as being up to date", () => {
  // Only one of those two answers means the reader can stop thinking about it.
  assert.equal(updateState(null, "/assets/index-AAA.js"), "unknown");
  assert.equal(updateState("http://x/assets/index-AAA.js", null), "unknown");
  assert.equal(updateState(null, null), "unknown");
});
