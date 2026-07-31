/**
 * Kind-constant sync guard.
 *
 * `crates/nuxx-core/src/kind.rs` owns every Nostr event-kind integer in Nuxx.
 * The web client re-declares the subset it needs as TypeScript constants, and a
 * mismatch is silent: the client keeps filtering on a number the relay no longer
 * routes, so the channel simply looks empty. This asserts every `KIND_*` in
 * `web/src/shared/constants/kinds.ts` equals the Rust value of the same name.
 *
 * The web subset is expected to be partial — extra kinds in Rust are fine. Only
 * disagreement on a shared name, or a name the Rust side does not define at all,
 * fails the check.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(projectRoot, "..");

const RUST_KINDS = path.join(repoRoot, "crates/nuxx-core/src/kind.rs");
const TS_KINDS = path.join(projectRoot, "src/shared/constants/kinds.ts");

/** @returns {Map<string, number>} `KIND_FOO` → integer */
function parseRustKinds(file) {
  const kinds = new Map();
  const pattern = /pub const (KIND_[A-Z0-9_]+):\s*u32\s*=\s*(\d+)\s*;/g;
  const source = readFileSync(file, "utf8");
  for (const match of source.matchAll(pattern)) {
    kinds.set(match[1], Number(match[2]));
  }
  return kinds;
}

/** @returns {Map<string, number>} `KIND_FOO` → integer */
function parseTsKinds(file) {
  const kinds = new Map();
  const pattern = /export const (KIND_[A-Z0-9_]+)\s*=\s*(\d+)\s*;/g;
  const source = readFileSync(file, "utf8");
  for (const match of source.matchAll(pattern)) {
    kinds.set(match[1], Number(match[2]));
  }
  return kinds;
}

const rust = parseRustKinds(RUST_KINDS);
const ts = parseTsKinds(TS_KINDS);

if (rust.size === 0) {
  console.error(
    `Kind check failed: parsed no KIND_* constants from ${RUST_KINDS}.\n` +
      "The declaration format in nuxx-core probably changed; update the parser " +
      "in web/scripts/check-kinds.mjs rather than deleting the guard.",
  );
  process.exit(1);
}

if (ts.size === 0) {
  console.error(
    `Kind check failed: parsed no KIND_* constants from ${TS_KINDS}.`,
  );
  process.exit(1);
}

const problems = [];
for (const [name, value] of ts) {
  if (!rust.has(name)) {
    problems.push(`${name}: not defined in nuxx-core (web has ${value})`);
    continue;
  }
  const rustValue = rust.get(name);
  if (rustValue !== value) {
    problems.push(`${name}: nuxx-core=${rustValue} web=${value}`);
  }
}

if (problems.length > 0) {
  console.error(`Kind check failed (${problems.length} problem(s)):\n`);
  for (const problem of problems) {
    console.error(`  ${problem}`);
  }
  console.error(
    "\ncrates/nuxx-core/src/kind.rs is the source of truth. Update " +
      "web/src/shared/constants/kinds.ts to match it.",
  );
  process.exit(1);
}

console.log(
  `Kind constants OK (${ts.size} web kinds verified against ${rust.size} in nuxx-core).`,
);
