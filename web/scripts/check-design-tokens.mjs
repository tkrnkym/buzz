/**
 * Design-token drift guard for the web client.
 *
 * The desktop app and the web client each declare the Buzz palette as CSS
 * custom properties. While both exist, the web client's set must stay a
 * superset of desktop's with identical values — otherwise a token edited on one
 * side silently changes only half the product, and the divergence is invisible
 * (Tailwind emits nothing for an undefined utility, so a missing token drops the
 * style with no build error).
 *
 * The check is intentionally one-directional: web MAY define extra tokens
 * (browser-only surfaces), but it may not omit or contradict a desktop token.
 *
 * Once `desktop/` is removed this guard has nothing to compare against and
 * skips, so the deletion cannot break CI.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(projectRoot, "..");

const DESKTOP_THEME = path.join(
  repoRoot,
  "desktop/src/shared/styles/globals/theme.css",
);
const WEB_GLOBALS = path.join(projectRoot, "src/shared/styles/globals.css");

/**
 * Collect `--token: value` pairs declared in the unscoped `:root` and `.dark`
 * blocks. Scoped selectors (`:root[data-buzz-sidebar]`, media queries) are
 * per-app chrome overrides, not palette definitions, so they are skipped.
 *
 * @param {string} file
 * @returns {Map<string, string>} keyed as `light|--token` / `dark|--token`
 */
function collectTokens(file) {
  const tokens = new Map();
  let scope = null;

  for (const rawLine of readFileSync(file, "utf8").split("\n")) {
    const line = rawLine.trim();

    if (/^:root\s*\{$/.test(line)) {
      scope = "light";
      continue;
    }
    if (/^\.dark\s*\{$/.test(line)) {
      scope = "dark";
      continue;
    }
    // Any other selector ends the palette block we care about.
    if (line.endsWith("{") || line.startsWith("@media")) {
      scope = null;
      continue;
    }

    const match = /^--([\w-]+):\s*([^;]+);$/.exec(line);
    if (match && scope) {
      const key = `${scope}|--${match[1]}`;
      // First declaration wins, mirroring how a later duplicate in the same
      // block would be an authoring mistake rather than an intended override.
      if (!tokens.has(key)) {
        tokens.set(key, match[2].trim());
      }
    }
  }

  return tokens;
}

if (!existsSync(DESKTOP_THEME)) {
  console.log(
    "Web design-token check skipped: desktop/ is not present, nothing to compare against.",
  );
  process.exit(0);
}

const desktop = collectTokens(DESKTOP_THEME);
const web = collectTokens(WEB_GLOBALS);

const missing = [];
const mismatched = [];

for (const [key, desktopValue] of desktop) {
  if (!web.has(key)) {
    missing.push(key);
    continue;
  }
  const webValue = web.get(key);
  if (webValue !== desktopValue) {
    mismatched.push({ key, desktopValue, webValue });
  }
}

if (missing.length === 0 && mismatched.length === 0) {
  console.log(
    `Web design tokens OK (${desktop.size} desktop tokens present, values match).`,
  );
  process.exit(0);
}

console.error("Web design-token check failed.\n");

if (missing.length > 0) {
  console.error(
    `Missing from web/src/shared/styles/globals.css (${missing.length}):`,
  );
  for (const key of missing) {
    const [scope, token] = key.split("|");
    console.error(`  ${token}  (${scope})`);
  }
  console.error("");
}

if (mismatched.length > 0) {
  console.error(`Value mismatches (${mismatched.length}):`);
  for (const { key, desktopValue, webValue } of mismatched) {
    const [scope, token] = key.split("|");
    console.error(
      `  ${token} (${scope}): desktop=${desktopValue} web=${webValue}`,
    );
  }
  console.error("");
}

console.error(
  "The Buzz palette has one source of truth while both clients exist.\n" +
    "Copy the declaration from desktop/src/shared/styles/globals/theme.css into\n" +
    "web/src/shared/styles/globals.css (or update desktop if the web value is the\n" +
    "intended one). See web/scripts/check-design-tokens.mjs.",
);
process.exit(1);
