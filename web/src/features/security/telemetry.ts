/**
 * What leaves the deployment, and what never does.
 *
 * The list of things never collected is the load-bearing part, and it is
 * expressed as a type rather than as a promise in a paragraph: a
 * {@link TelemetryEvent} has nowhere to put message bodies, file contents,
 * secrets or agent input/output, so a future caller cannot add them by
 * accident. A sentence saying "we don't collect that" is only as good as
 * everyone who touches the code afterwards.
 *
 * The defaults differ by edition, and not arbitrarily. A self-hosted
 * deployment sends nothing unless someone turns it on, because the operator did
 * not ask a vendor to watch their servers. A hosted one has to send the minimum
 * needed to keep the service up and bill for it — a hosted service that cannot
 * see its own error rate cannot be operated — and that minimum is separated
 * from product analytics so the two can be answered differently.
 */

export type Edition = "community" | "self-hosted-enterprise" | "saas";

export type TelemetryCategory = "operational" | "product-analytics";

export interface CategoryInfo {
  id: TelemetryCategory;
  label: string;
  description: string;
}

export const TELEMETRY_CATEGORIES: ReadonlyArray<CategoryInfo> = [
  {
    id: "operational",
    label: "運用に必要なもの",
    description:
      "障害・性能・請求・不正利用の防止。ホスティングを続けるために要るものだけです。",
  },
  {
    id: "product-analytics",
    label: "製品改善のための計測",
    description:
      "どの画面がどれだけ使われているか。止めてもサービスの動作は変わりません。",
  },
];

/**
 * What a category's setting is for an edition.
 *
 * `required` is only ever operational telemetry on the hosted service, and it
 * is shown as required rather than as a switch that silently does nothing.
 */
export type CategoryState = "required" | "optional-on" | "optional-off";

export function defaultState(
  edition: Edition,
  category: TelemetryCategory,
): CategoryState {
  if (edition === "saas") {
    // The minimum to operate and bill; separable analytics default off.
    return category === "operational" ? "required" : "optional-off";
  }
  // Nobody asked a vendor to watch a self-hosted server.
  return "optional-off";
}

/** Whether the reader may change this one. */
export function isConfigurable(state: CategoryState): boolean {
  return state !== "required";
}

/**
 * A telemetry event, as everything it is allowed to be.
 *
 * Counters and durations, named by an event key. There is deliberately no
 * free-text field: one would immediately be used for "context", and context is
 * where a message body ends up.
 */
export interface TelemetryEvent {
  /** A fixed key from the code, never user-supplied text. */
  event: string;
  at: number;
  /** Numeric measurements only. */
  metrics: Record<string, number>;
  /** Low-cardinality enums — never identifiers, never content. */
  tags: Record<string, string>;
}

/** The things that are never sent, whatever else changes. */
export const NEVER_COLLECTED = [
  "メッセージ本文",
  "Files の内容",
  "Secrets",
  "Agent の入出力",
] as const;

/**
 * Whether a tag value is safe to send.
 *
 * A tag value is an enum written in this codebase — `sidebar`, `composer`,
 * `dm` — so the test is whether it looks like one, not whether it looks
 * harmful. That shape check is what makes it hold: content does not happen to
 * be a short lowercase ASCII identifier.
 *
 * A length limit alone would not do it. "今日のリリースは金曜に延期します" is
 * sixteen characters and an entire message; Japanese is dense enough that any
 * cap generous enough for real enum names is also generous enough for a
 * sentence. So anything outside the ASCII identifier alphabet is rejected
 * outright, which also catches every message body regardless of length.
 */
export function isSafeTagValue(value: string): boolean {
  // Deliberately narrow: lowercase letters, digits, and the separators enum
  // names actually use. Everything else — CJK, spaces, punctuation — is content.
  if (!/^[a-z0-9._-]{1,32}$/.test(value)) return false;
  // A long hex run is an id or a hash, not a name.
  if (/^[0-9a-f]{16,}$/.test(value)) return false;
  return true;
}

/**
 * Drop anything a caller should not have put in an event.
 *
 * Belt and braces on top of the type: the type stops a field being added, and
 * this stops an allowed field being misused. Returns the event with unsafe tags
 * removed rather than throwing, so a telemetry mistake never breaks the feature
 * it was measuring.
 */
export function sanitize(event: TelemetryEvent): TelemetryEvent {
  const tags: Record<string, string> = {};
  for (const [key, value] of Object.entries(event.tags)) {
    if (isSafeTagValue(value)) tags[key] = value;
  }
  return { ...event, tags };
}
