import type { MeshNode, Showcase } from "@/mock/showcase";

/**
 * Fixture edits for the shared-compute panel.
 *
 * Sharing, the served model and the VRAM cap were component state, so all three
 * reverted when the reader left the panel — including the cap, which is the one
 * setting on that screen with a consequence attached.
 */

/**
 * Start or stop sharing.
 *
 * Turning it on goes to `starting` rather than `serving`: a node has to come up
 * before it can answer anything, and a switch that jumps straight to "共有中"
 * would be claiming a state the machine has not reached. Turning it off is
 * immediate, because refusing new work needs nothing to happen first.
 */
export function setMeshSharing(current: Showcase, on: boolean): Showcase {
  const status: MeshNode["status"] = on ? "starting" : "off";
  return {
    ...current,
    mesh: {
      ...current.mesh,
      status,
      // Nothing is in flight once sharing is off, and leaving the old number
      // there would read as requests still being served.
      servingRequests: on ? current.mesh.servingRequests : 0,
    },
  };
}

export function setMeshModel(current: Showcase, model: string): Showcase {
  return { ...current, mesh: { ...current.mesh, model } };
}

/**
 * The ceiling on how much VRAM other people's requests may use.
 *
 * Floored at 1 GB. Zero would be sharing that cannot serve anything — the switch
 * on and the node unable to answer — which looks like a fault rather than a
 * setting.
 */
export function setMeshVram(current: Showcase, maxVramGb: number): Showcase {
  const clamped = Number.isFinite(maxVramGb) ? Math.max(1, maxVramGb) : 1;
  return { ...current, mesh: { ...current.mesh, maxVramGb: clamped } };
}
