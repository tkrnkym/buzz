import assert from "node:assert/strict";
import test from "node:test";

import {
  setMeshModel,
  setMeshSharing,
  setMeshVram,
} from "@/features/compute/mesh-mutations";

const base = () => ({
  mesh: {
    status: "serving",
    model: "qwen2.5-coder:14b",
    maxVramGb: 8,
    servingRequests: 3,
    download: null,
    installedModels: ["qwen2.5-coder:14b"],
  },
});

test("turning sharing on starts the node rather than declaring it serving", () => {
  // A node has to come up before it can answer anything; jumping to 共有中 would
  // claim a state the machine has not reached.
  const off = setMeshSharing(base(), false);
  assert.equal(off.mesh.status, "off");
  assert.equal(setMeshSharing(off, true).mesh.status, "starting");
});

test("stopping clears the in-flight count", () => {
  // Leaving 3 there would read as requests still being served.
  assert.equal(setMeshSharing(base(), false).mesh.servingRequests, 0);
});

test("the VRAM cap never goes below a gigabyte", () => {
  assert.equal(setMeshVram(base(), 16).mesh.maxVramGb, 16);
  // Zero is sharing that cannot serve — the switch on and the node unable to
  // answer, which looks like a fault rather than a setting.
  assert.equal(setMeshVram(base(), 0).mesh.maxVramGb, 1);
  assert.equal(setMeshVram(base(), -4).mesh.maxVramGb, 1);
  assert.equal(setMeshVram(base(), Number.NaN).mesh.maxVramGb, 1);
});

test("the served model is taken as typed", () => {
  // A model can be pulled on demand, so it is not restricted to what is installed.
  assert.equal(setMeshModel(base(), "llama3.3:70b").mesh.model, "llama3.3:70b");
});
