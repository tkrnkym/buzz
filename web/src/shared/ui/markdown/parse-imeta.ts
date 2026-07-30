/**
 * NIP-92 `imeta` tag parsing.
 *
 * A message that carries media puts one `imeta` tag per attachment, each a list
 * of `"<key> <value>"` strings. The parsed `dim` is what lets the renderer
 * reserve correct layout space before an image decodes, so the timeline does not
 * jump when a tall image arrives late.
 *
 * Ported from `desktop/src/shared/ui/markdown/parseImeta.ts`.
 */

export interface ImetaEntry {
  url: string;
  /** MIME type. */
  m?: string;
  /** SHA-256 of the file, hex. */
  x?: string;
  size?: number;
  /** Intrinsic dimensions as `"<width>x<height>"`. */
  dim?: string;
  blurhash?: string;
  alt?: string;
  thumb?: string;
  duration?: number;
  image?: string;
  filename?: string;
}

/** Parse every `imeta` tag on an event, keyed by the attachment URL. */
export function parseImetaTags(tags: string[][]): Map<string, ImetaEntry> {
  const entries = new Map<string, ImetaEntry>();

  for (const tag of tags) {
    if (tag[0] !== "imeta") continue;

    const entry: Partial<ImetaEntry> = {};
    for (const part of tag.slice(1)) {
      // Values can contain spaces (`alt`, `filename`), so split on the first
      // separator only.
      const separator = part.indexOf(" ");
      if (separator === -1) continue;
      const key = part.slice(0, separator);
      const value = part.slice(separator + 1);

      switch (key) {
        case "url":
          entry.url = value;
          break;
        case "m":
          entry.m = value;
          break;
        case "x":
          entry.x = value;
          break;
        case "size":
          entry.size = Number.parseInt(value, 10);
          break;
        case "dim":
          entry.dim = value;
          break;
        case "blurhash":
          entry.blurhash = value;
          break;
        case "alt":
          entry.alt = value;
          break;
        case "thumb":
          entry.thumb = value;
          break;
        case "duration":
          entry.duration = Number.parseFloat(value);
          break;
        case "image":
          entry.image = value;
          break;
        case "filename":
          entry.filename = value;
          break;
        default:
          // Unknown keys are ignored rather than rejected: NIP-92 allows
          // producers to add their own, and dropping the whole entry would lose
          // an attachment the reader can otherwise see.
          break;
      }
    }

    if (entry.url) {
      entries.set(entry.url, entry as ImetaEntry);
    }
  }

  return entries;
}

/**
 * Intrinsic pixel dimensions from a NIP-92 `dim` value (`"WxH"`).
 *
 * Used to stamp explicit `width`/`height` on inline images so the browser
 * reserves aspect-ratio-correct space *before* the image decodes.
 */
export function dimensionsFromDim(
  dim: string | undefined,
): { width: number; height: number } | undefined {
  if (!dim) return undefined;
  const match = /^(\d+)x(\d+)$/i.exec(dim);
  if (!match) return undefined;

  const width = Number(match[1]);
  const height = Number(match[2]);
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return undefined;
  }
  return { width, height };
}
