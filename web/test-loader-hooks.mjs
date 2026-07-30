/**
 * Minimal ESM resolve/load hooks so `node --test` can import the app's source.
 *
 * Vite resolves three things node's ESM resolver does not: the `@/` alias,
 * extensionless relative imports of `.ts` siblings, and side-effect CSS imports.
 * Node 24 strips TypeScript types natively (`--experimental-strip-types`), so no
 * transpilation is needed here — only resolution.
 *
 * Mirrors `desktop/test-loader-hooks.mjs`, minus the desktop-only stubs.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const srcRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "src",
);

// `nextResolve` wants a URL or a relative path. An absolute POSIX path happens to
// work, but on Windows `C:\...` parses as protocol `c:` and the run dies with
// ERR_UNSUPPORTED_ESM_URL_SCHEME. Hand node proper file:// URLs everywhere.
function toFileSpecifier(candidatePath) {
  return path.isAbsolute(candidatePath)
    ? pathToFileURL(candidatePath).href
    : candidatePath;
}

function resolveSourcePath(basePath) {
  // Existence decides, not path.extname — a dotted basename like `foo.utils`
  // (→ `foo.utils.ts` on disk) looks like it already carries an extension.
  if (fs.existsSync(basePath) && fs.statSync(basePath).isFile()) {
    return basePath;
  }
  for (const extension of [".ts", ".tsx", ".js", ".jsx", ".mjs"]) {
    const candidate = `${basePath}${extension}`;
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  for (const extension of [".ts", ".tsx", ".js", ".jsx", ".mjs"]) {
    const candidate = path.join(basePath, `index${extension}`);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

export function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const stripped = specifier.slice(2);
    const resolved = resolveSourcePath(path.join(srcRoot, stripped));
    return nextResolve(
      toFileSpecifier(resolved ?? path.join(srcRoot, stripped)),
      context,
    );
  }

  if (
    (specifier.startsWith("./") || specifier.startsWith("../")) &&
    context.parentURL?.startsWith("file:")
  ) {
    const parentPath = fileURLToPath(context.parentURL);
    const resolved = resolveSourcePath(
      path.resolve(path.dirname(parentPath), specifier),
    );
    if (resolved) {
      return nextResolve(toFileSpecifier(resolved), context);
    }
  }

  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  // Vite handles side-effect CSS imports at bundle time; node has no CSS loader.
  if (url.endsWith(".css")) {
    return { format: "module", shortCircuit: true, source: "" };
  }
  return nextLoad(url, context);
}
