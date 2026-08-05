/**
 * Whether a newer build has been deployed.
 *
 * A web client has no download to apply — it updates when the page is reloaded —
 * so "check for updates" could easily be a button that lies. But there *is* a real
 * question behind it: the bundle running in this tab is the one that was deployed
 * when the tab was opened, and a tab left open for a week is running last week's
 * code. That is worth telling someone, and it is answerable.
 *
 * The answer comes from the entry script's filename. Vite hashes it by content, so
 * a freshly fetched `index.html` naming a different script *is* a new deployment —
 * no version endpoint, no service worker, and nothing to keep in step by hand.
 */

/** The hashed entry script this tab is running, or `null` if it cannot be found. */
export function loadedScriptUrl(scripts: ReadonlyArray<string>): string | null {
  // The built entry is the module script under `assets/`. Others (an injected dev
  // client, an analytics tag) are not what the deployment is identified by.
  const entry = scripts.find((src) => /\/assets\/index-[^/]+\.js$/.test(src));
  return entry ?? null;
}

/** The entry script the server is currently serving. */
export function deployedScriptUrl(html: string): string | null {
  const matches = [...html.matchAll(/src="([^"]*\/assets\/index-[^"]+\.js)"/g)];
  return matches[0]?.[1] ?? null;
}

export type UpdateState = "current" | "available" | "unknown";

/**
 * What to tell the reader.
 *
 * `unknown` when either side could not be read, and it says so rather than
 * claiming to be up to date: "no update found" and "could not look" are different
 * answers, and only one of them means the reader can stop thinking about it.
 */
export function updateState(
  loaded: string | null,
  deployed: string | null,
): UpdateState {
  if (!loaded || !deployed) return "unknown";
  // Compared on the filename, not the whole URL: the two are fetched through
  // different bases (a relative `src` in the HTML against an absolute one on the
  // live document), and the hash is the part that carries the identity.
  return fileName(loaded) === fileName(deployed) ? "current" : "available";
}

function fileName(url: string): string {
  return url.split("/").pop() ?? url;
}
