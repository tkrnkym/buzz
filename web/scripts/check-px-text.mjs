import path from "node:path";
import { fileURLToPath } from "node:url";
import { runPxTextCheck } from "../../scripts/check-px-text-core.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

// Enforces the rem-token text scale across the web client. Readable text MUST
// use a rem-based token (the stock `text-base`/`text-sm`/`text-xs` scale, or the
// `text-2xs` / `text-3xs` meta-text tokens defined in `tailwind.config.js`) so
// browser zoom scales it and sizes stay on one consolidated scale. Arbitrary
// literals — `text-[15px]` and `text-[0.9rem]` alike — fragment that scale, so
// both forms are rejected; add a rem-based token instead.
const rules = [
  {
    root: "src",
    extensions: new Set([".ts", ".tsx", ".css"]),
  },
];

// Decorative / chrome exceptions: `relativePath:matchedLiteral`. Matching the
// literal keeps an exception stable when unrelated edits move lines.
const overrides = new Set();

await runPxTextCheck({
  projectRoot,
  rules,
  overrides,
  label: "Web",
  scriptPath: "web/scripts/check-px-text.mjs",
});
