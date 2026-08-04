import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_SOUND,
  isSoundName,
  soundRecipe,
  SOUNDS,
  waveformBars,
} from "@/features/notifications/notification-sounds";

test("every sound has a label and a recipe", () => {
  for (const sound of SOUNDS) {
    assert.ok(sound.label, sound.name);
    assert.ok(Array.isArray(sound.tones), sound.name);
  }
});

test("silence is a choice, not the absence of one", () => {
  // Turning the category off would also stop the desktop popup, which is a
  // different request.
  assert.deepEqual(soundRecipe("none").tones, []);
  assert.equal(isSoundName("none"), true);
});

test("an unknown sound falls back to the default rather than going silent", () => {
  assert.equal(isSoundName("airhorn"), false);
  assert.equal(soundRecipe("airhorn").name, DEFAULT_SOUND);
});

test("the waveform is derived from the tones, so it cannot disagree with them", () => {
  // A picture drawn per sound could ship showing a different one.
  assert.equal(waveformBars("ping").length, 1);
  assert.equal(waveformBars("chime").length, 3);
  assert.deepEqual(waveformBars("none"), []);
  // Rising tones give rising bars; the tallest is the highest pitch.
  const chime = waveformBars("chime");
  assert.ok(chime[0].height < chime[2].height);
  assert.equal(chime.at(-1).height, 1);
});

test("a bar is never invisible, however low the tone", () => {
  // `knock` is two low thuds against nothing else; a zero-height bar would read as
  // a rendering fault.
  for (const bar of waveformBars("knock")) assert.ok(bar.height >= 0.25);
});

test("each beat has its own key, even when two are the same pitch", () => {
  // `knock` is one pitch twice: those are two beats, not one repeated.
  const knock = waveformBars("knock");
  assert.deepEqual(
    knock.map((bar) => bar.key),
    ["knock:1", "knock:2"],
  );
  assert.equal(knock[0].height, knock[1].height);
});
