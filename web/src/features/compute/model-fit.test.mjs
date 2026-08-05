import assert from "node:assert/strict";
import test from "node:test";

import { fitFor, rankModels } from "@/features/compute/model-fit";

test("a model that fills the budget is tight, not comfortable", () => {
  // The context window grows with the conversation, so a model that loads and then
  // fails on a long thread is worse than one that never loaded.
  assert.equal(fitFor(4.6, 18), "fits");
  assert.equal(fitFor(17, 18), "tight");
  assert.equal(fitFor(24, 18), "over");
  assert.equal(fitFor(12.7, 18), "tight");
});

test("a budget of nothing fits nothing", () => {
  assert.equal(fitFor(1, 0), "over");
  assert.equal(fitFor(1, -4), "over");
});

test("suggestions are best fit first, largest within each band", () => {
  // Largest-within-band because a bigger model that still fits is the better answer.
  const ranked = rankModels(
    [
      { id: "tiny", sizeGb: 1 },
      { id: "huge", sizeGb: 40 },
      { id: "good", sizeGb: 4.6 },
      { id: "tight", sizeGb: 17 },
    ],
    18,
  );
  assert.deepEqual(
    ranked.map((row) => row.model.id),
    ["good", "tiny", "tight", "huge"],
  );
});

test("a model that does not fit stays on the list", () => {
  // The reader's next question is whether a smaller quantization exists; dropping it
  // turns "too big for you" into "does not exist".
  const ranked = rankModels([{ id: "huge", sizeGb: 40 }], 8);
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].fit, "over");
});
