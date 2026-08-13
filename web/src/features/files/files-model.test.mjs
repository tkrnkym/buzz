import assert from "node:assert/strict";
import test from "node:test";

import {
  defaultLinkVisibility,
  formatFileSize,
  originOfTruth,
  searchableFiles,
  viewFile,
  viewFiles,
} from "@/features/files/files-model";

const file = (overrides = {}) => ({
  id: "file-1",
  name: "決算_最終版_役員会.xlsx",
  origin: "google-drive",
  kind: "link",
  sizeBytes: 2_400_000,
  authorPubkey: "a".repeat(64),
  updatedAt: 1000,
  version: 3,
  hash: "sha256:abcdef",
  channel: "finance",
  access: "granted",
  ...overrides,
});

test("a locked file leaks none of its metadata", () => {
  const secret = file({ access: "denied" });
  const view = viewFile(secret);
  assert.equal(view.locked, true);

  // The whole rule, asserted against the serialized view: a name alone tells
  // you most of what a document was for, and a size plus an author tells you
  // the rest.
  const serialized = JSON.stringify(view);
  for (const leak of [
    secret.name,
    secret.origin,
    secret.hash,
    secret.authorPubkey,
    secret.channel,
    String(secret.sizeBytes),
    String(secret.version),
  ]) {
    assert.ok(
      !serialized.includes(leak),
      `the locked view leaked ${JSON.stringify(leak)}`,
    );
  }
});

test("a locked view has no file to reach for at all", () => {
  const view = viewFile(file({ access: "denied" }));
  // Structural, not just absent-valued: a component cannot write `view.file.name`
  // against this shape even by accident.
  assert.equal("file" in view, false);
});

test("a readable file keeps everything", () => {
  const view = viewFile(file());
  assert.equal(view.locked, false);
  assert.equal(view.file.name, "決算_最終版_役員会.xlsx");
});

test("locked files stay in the list rather than vanishing from it", () => {
  const views = viewFiles([
    file({ id: "a" }),
    file({ id: "b", access: "denied" }),
    file({ id: "c" }),
  ]);
  // Removing it silently makes "12 files, 9 shown" unanswerable.
  assert.equal(views.length, 3);
  assert.deepEqual(
    views.map((view) => view.locked),
    [false, true, false],
  );
});

test("search, summaries and agents never receive a locked file", () => {
  const files = [file({ id: "a" }), file({ id: "b", access: "denied" })];
  const searchable = searchableFiles(files);
  // Removed outright, not redacted — these are the paths a name escapes by.
  assert.deepEqual(
    searchable.map((row) => row.id),
    ["a"],
  );
  assert.ok(
    !JSON.stringify(searchable).includes("決算") ||
      searchable.every((row) => row.access === "granted"),
  );
});

test("a link's source stays authoritative; an import's does not", () => {
  assert.equal(originOfTruth(file({ kind: "link" })), "external");
  assert.equal(originOfTruth(file({ kind: "import" })), "nuxx");
});

test("an unconfirmed external link starts private, not public", () => {
  // Defaulting the other way would publish the existence and name of a document
  // to people the source system would not have shown it to.
  assert.equal(defaultLinkVisibility(false), "private");
  assert.equal(defaultLinkVisibility(true), "public");
});

test("sizes are formatted at human scale", () => {
  assert.equal(formatFileSize(0), "0 B");
  assert.equal(formatFileSize(900), "900 B");
  assert.equal(formatFileSize(2_400_000), "2.3 MB");
  assert.equal(formatFileSize(null), "—");
});
