/**
 * The alert tones, per category.
 *
 * Synthesized rather than shipped as audio files. A handful of short tones is a few
 * hundred bytes of oscillator recipe against a few hundred kilobytes of assets, and
 * the point of the choice is that two categories sound *different* — which a
 * frequency pair delivers as well as a recording does.
 *
 * `none` exists so a category can be armed for a desktop popup without a sound.
 * Muting it by turning the category off would also stop the popup, which is not the
 * same request.
 */

export type SoundName = "flutter" | "ping" | "knock" | "chime" | "none";

export interface SoundRecipe {
  name: SoundName;
  label: string;
  /** Hz, played in order. Empty means silence. */
  tones: ReadonlyArray<number>;
  /** Seconds between tone onsets. */
  gap: number;
}

export const SOUNDS: ReadonlyArray<SoundRecipe> = [
  { name: "flutter", label: "flutter", tones: [880, 1174.7], gap: 0.09 },
  { name: "ping", label: "ping", tones: [1568], gap: 0 },
  { name: "knock", label: "knock", tones: [196, 196], gap: 0.13 },
  { name: "chime", label: "chime", tones: [659.3, 987.8, 1318.5], gap: 0.11 },
  { name: "none", label: "none", tones: [], gap: 0 },
];

export const DEFAULT_SOUND: SoundName = "flutter";

export function isSoundName(value: unknown): value is SoundName {
  return SOUNDS.some((sound) => sound.name === value);
}

export function soundRecipe(name: SoundName): SoundRecipe {
  return (
    SOUNDS.find((sound) => sound.name === name) ??
    SOUNDS.find((sound) => sound.name === DEFAULT_SOUND) ??
    SOUNDS[0]
  );
}

/**
 * A shape for the row's little waveform, from the recipe itself.
 *
 * Derived rather than drawn per sound, so a new tone cannot ship with a picture of a
 * different one. Each bar's height is its tone's pitch relative to the loudest in
 * the set — which is what makes `knock` read as two low thuds and `chime` as a rise.
 *
 * Each bar carries a key, because a tone sequence has no ids and its heights are not
 * unique — `knock` is the same pitch twice, and those are two different beats rather
 * than one repeated. "The nth beat of this sound" is what a bar actually is.
 */
export function waveformBars(
  name: SoundName,
): { key: string; height: number }[] {
  const { tones } = soundRecipe(name);
  if (tones.length === 0) return [];
  const highest = Math.max(...tones);
  return tones.map((tone, beat) => ({
    key: `${name}:${beat + 1}`,
    height: Math.max(0.25, tone / highest),
  }));
}
