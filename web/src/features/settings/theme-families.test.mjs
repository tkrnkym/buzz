import assert from "node:assert/strict";
import test from "node:test";

import {
  familyLabel,
  familyOf,
  memberFor,
  themeFamilies,
} from "@/features/settings/theme-families";

test("a family label drops the half-word wherever it sits", () => {
  // Not a suffix trim: the distinguishing word comes *after* the half in both of
  // these, so cutting from the end would give "Github" for three families.
  assert.equal(familyLabel("github-light"), "Github");
  assert.equal(familyLabel("github-light-default"), "Github Default");
  assert.equal(
    familyLabel("github-dark-high-contrast"),
    "Github High Contrast",
  );
  assert.equal(familyLabel("gruvbox-light-hard"), "Gruvbox Hard");
  assert.equal(familyLabel("material-theme-lighter"), "Material Theme");
});

test("the first-party pair is named for the product, not its id", () => {
  // The files are named for the relay, the picker is read by someone using the app.
  assert.equal(familyLabel("nuxx"), "Buzz");
  assert.equal(familyLabel("nuxx-dark"), "Buzz");
});

test("both halves of a pair land in one family", () => {
  const families = themeFamilies();
  const github = families.filter((family) => family.label === "Github");
  assert.equal(github.length, 1);
  assert.equal(github[0].light, "github-light");
  assert.equal(github[0].dark, "github-dark");
});

test("the first-party family comes first", () => {
  // `THEME_PAIRS` order, which puts it first deliberately.
  assert.equal(themeFamilies()[0].label, "Buzz");
});

test("every theme belongs to exactly one family", () => {
  const families = themeFamilies();
  const members = families.flatMap((family) =>
    [family.light, family.dark].filter(Boolean),
  );
  // No theme counted twice, and none dropped: a missing one is a look the reader
  // can no longer reach at all.
  assert.equal(new Set(members).size, members.length);
  assert.equal(familyOf("vitesse-dark").label, "Vitesse");
  assert.equal(familyOf("snazzy-light").light, "snazzy-light");
});

test("an unpaired family is applied in the shade it has", () => {
  // Refusing silently would be worse: the reader asked for that look.
  const single = {
    id: "snazzy-light",
    label: "Snazzy",
    light: "snazzy-light",
    dark: null,
  };
  assert.equal(memberFor(single, true), "snazzy-light");
  assert.equal(memberFor(single, false), "snazzy-light");

  const pair = {
    id: "github-light",
    label: "Github",
    light: "github-light",
    dark: "github-dark",
  };
  assert.equal(memberFor(pair, true), "github-dark");
  assert.equal(memberFor(pair, false), "github-light");
});
