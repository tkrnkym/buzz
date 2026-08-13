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
  // (PubkeyAvatar no longer slices a key at all — its initials and its tooltip
  // both read the membership id now, so the allowance it used to need is gone.)
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
  // Nothing is allowed to truncate a key any more. `shared/lib/pubkey.ts` held
  // the one canonical shortener and is gone: after §7 the product names people
  // by membership id, so a truncated key has no place left to be displayed.
  allowedFiles: new Set(),
  label: "Web",
  scriptPath: "web/scripts/check-pubkey-truncation.mjs",
});
