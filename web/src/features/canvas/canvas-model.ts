/**
 * The channel canvas: one shared document per room.
 *
 * A channel is a stream — good for what is happening, bad for what is true. The
 * canvas is the other half: the current state of the thing the room is about,
 * edited in place rather than restated every few days. An incident channel's
 * timeline is the investigation; its canvas is what is broken and what has been
 * tried.
 *
 * A canvas is seeded from the channel template's `canvasTemplate`, which is why
 * the placeholder substitution lives here. The placeholders are a fixed, closed
 * set on purpose — see {@link fillPlaceholders}.
 */

export interface Canvas {
  channelId: string;
  body: string;
  updatedAt: number;
  /** Who last wrote it. A canvas has no author, only a last editor. */
  updatedByPubkey: string;
  /** Bumped on every save, so two editors can notice they disagreed. */
  revision: number;
}

/**
 * The values a template's placeholders resolve against.
 *
 * A closed set, not arbitrary interpolation. Two reasons: a template author
 * writing `{secrets.api_key}` should get those characters back rather than a
 * credential, and a placeholder that silently resolves to nothing is worse than
 * one that stays visible — the reader can see what went wrong.
 */
export interface PlaceholderValues {
  channelName: string;
  templateName: string;
}

/** What may appear between braces, and what each maps to. */
const PLACEHOLDERS: Record<string, keyof PlaceholderValues> = {
  "channel.name": "channelName",
  "template.name": "templateName",
};

/** The tokens a template author may write, for the help text under the field. */
export const PLACEHOLDER_TOKENS = Object.keys(PLACEHOLDERS).map(
  (key) => `{${key}}`,
);

/**
 * Fill a template's placeholders.
 *
 * Every occurrence is replaced, not just the first — a heading and a footer
 * both naming the channel is the ordinary case. An unrecognised token is left
 * exactly as written: substituting an empty string would hide the typo, and
 * resolving arbitrary paths would turn a template into an expression language
 * with access to whatever the caller happened to pass.
 */
export function fillPlaceholders(
  template: string,
  values: PlaceholderValues,
): string {
  return template.replace(/\{([a-z.]+)\}/g, (whole, token: string) => {
    const key = PLACEHOLDERS[token];
    return key === undefined ? whole : values[key];
  });
}

/** A canvas seeded from a template, ready to be saved. */
export function canvasFromTemplate({
  channelId,
  nowSeconds,
  template,
  updatedByPubkey,
  values,
}: {
  channelId: string;
  nowSeconds: number;
  template: string;
  updatedByPubkey: string;
  values: PlaceholderValues;
}): Canvas {
  return {
    channelId,
    body: fillPlaceholders(template, values),
    updatedAt: nowSeconds,
    updatedByPubkey,
    revision: 1,
  };
}

/**
 * Whether a save would overwrite someone else's newer edit.
 *
 * The canvas is one document that several people can have open. Comparing the
 * revision the editor started from against the one on disk is what turns a
 * silent overwrite into a question — a shared document that last-write-wins is
 * one where the person who typed slower loses their work without being told.
 */
export function isStaleWrite(
  startedFromRevision: number,
  currentRevision: number,
): boolean {
  return startedFromRevision < currentRevision;
}

/** Apply an edit, bumping the revision. */
export function applyEdit(
  canvas: Canvas,
  body: string,
  updatedByPubkey: string,
  nowSeconds: number,
): Canvas {
  return {
    ...canvas,
    body,
    updatedAt: nowSeconds,
    updatedByPubkey,
    revision: canvas.revision + 1,
  };
}

/**
 * Whether a canvas has anything in it.
 *
 * Whitespace-only counts as empty: a canvas seeded from a template that was
 * itself blank should offer the "start one" affordance rather than an empty
 * editor claiming to hold something.
 */
export function isEmpty(canvas: Canvas | null): boolean {
  return canvas === null || canvas.body.trim().length === 0;
}
