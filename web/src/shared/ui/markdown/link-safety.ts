/**
 * Which hrefs in user-authored content may become activatable links.
 *
 * User content must not be able to produce a link whose activation does
 * something the reader cannot predict from what they see.
 */

/** Schemes allowed to render as an anchor. */
const CLICKABLE_SCHEMES = new Set(["http:", "https:", "mailto:"]);

/**
 * Whether `href` may be rendered as an activatable anchor.
 *
 * Parsed with no base URL, so only an absolute URL with an allowed scheme
 * qualifies. Two cases this deliberately rejects:
 *
 * - **The empty string.** react-markdown's `defaultUrlTransform` blanks a
 *   dangerous scheme rather than removing the anchor, so `[x](javascript:…)`
 *   arrives as `href=""`. Resolving that against a base would turn it into a
 *   clickable same-page link — the sanitizer's output must not be promoted back
 *   into a link.
 * - **Relative URLs.** In chat content they would resolve against the relay
 *   origin, which is never what the author meant.
 */
export function isClickableHref(href: string): boolean {
  if (!href.trim()) return false;
  try {
    return CLICKABLE_SCHEMES.has(new URL(href).protocol);
  } catch {
    return false;
  }
}
