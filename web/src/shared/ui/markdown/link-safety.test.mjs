import assert from "node:assert/strict";
import test from "node:test";

import { isClickableHref } from "@/shared/ui/markdown/link-safety";

test("web and mail links are clickable", () => {
  assert.equal(isClickableHref("https://example.com/docs"), true);
  assert.equal(isClickableHref("http://example.com"), true);
  assert.equal(isClickableHref("mailto:someone@example.com"), true);
});

test("a blanked href is never promoted back into a link", () => {
  // react-markdown's defaultUrlTransform replaces a dangerous scheme with "",
  // leaving the anchor in place. Resolving that against a base would make it a
  // clickable same-page link — the sanitizer's output must stay inert.
  assert.equal(isClickableHref(""), false);
  assert.equal(isClickableHref("   "), false);
});

test("script and data URLs are not clickable", () => {
  assert.equal(isClickableHref("javascript:alert(1)"), false);
  assert.equal(isClickableHref("data:text/html,<script>x</script>"), false);
  assert.equal(isClickableHref("vbscript:msgbox"), false);
});

test("relative URLs are not clickable", () => {
  // In chat content these resolve against the relay origin, which is never what
  // the author meant.
  assert.equal(isClickableHref("/channels/general"), false);
  assert.equal(isClickableHref("../up"), false);
  assert.equal(isClickableHref("example.com"), false);
});

test("app schemes are not clickable by default", () => {
  // A caller that handles its own scheme injects a link renderer; the default
  // path must not activate one it does not understand.
  assert.equal(isClickableHref("buzz://message?channel=x&id=y"), false);
});
