import path from "node:path";
import { fileURLToPath } from "node:url";
import { runPubkeyTruncationCheck } from "../../scripts/check-pubkey-truncation-core.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

const rules = [
  {
    root: "src",
    extensions: new Set([".ts", ".tsx"]),
  },
];

const overrides = new Set([
  // Avatar fallback initials — two glyphs inside an avatar disc, not an
  // identity string. The one place allowed to do it; every avatar goes through
  // this component, and it prefers the display name's initials when there is one.
  "src/shared/ui/PubkeyAvatar.tsx:73",
  // Array window (first N pubkeys), not string truncation.
  "src/features/repos/ui/OrgSidebar.tsx:22",
  // Also an array window: the first few thread participants for the avatar
  // stack. Each pubkey is passed through whole.
  "src/features/messages/ui/ThreadSummaryRow.tsx:32",
]);

await runPubkeyTruncationCheck({
  projectRoot,
  rules,
  overrides,
  allowedFiles: new Set(["src/shared/lib/pubkey.ts"]),
  label: "Web",
  scriptPath: "web/scripts/check-pubkey-truncation.mjs",
});
