/**
 * Fixture edits for the Agents screen.
 *
 * Where the demo's `ShowcaseAgent` shape and the create/edit form meet. When
 * agents get a relay path this is the file that gets replaced.
 */

import type { AgentDraft } from "@/features/agents/ui/AgentFormDialog";
import { agentAvatarUrl } from "@/mock/agent-avatar";
import type { AgentDefaults, Showcase, ShowcaseAgent } from "@/mock/showcase";

/**
 * A pubkey for a newly created agent.
 *
 * Derived from the id so it is stable and readable in a test failure, and padded
 * to 64 hex characters because everything downstream — the avatar, the memory
 * lookup, the membership id — assumes a real-shaped key.
 */
function mockPubkey(seed: string): string {
  const hex = [...seed]
    .map((ch) => (ch.codePointAt(0) ?? 0).toString(16))
    .join("");
  return hex.padEnd(64, "0").slice(0, 64);
}

export function agentFromDraft(
  draft: AgentDraft,
  id: string,
  ownerPubkey: string,
  nowSeconds: number,
  existing?: ShowcaseAgent,
): ShowcaseAgent {
  return {
    id,
    pubkey: existing?.pubkey ?? mockPubkey(id),
    avatarUrl: existing?.avatarUrl ?? agentAvatarUrl(id),
    name: draft.name.trim(),
    purpose: draft.purpose.trim(),
    harness: draft.harness,
    model: draft.model.trim(),
    // A new agent starts idle, not working: it has nothing to do until something
    // addresses it, and showing it as busy on creation would be a small lie that
    // the activity line then cannot explain.
    status: existing?.status ?? "idle",
    channels: draft.channels,
    activity: existing?.activity ?? null,
    lastActiveAt: existing?.lastActiveAt ?? nowSeconds,
    ownerPubkey: existing?.ownerPubkey ?? ownerPubkey,
    turnsToday: existing?.turnsToday ?? 0,
  };
}

export function addAgent(current: Showcase, agent: ShowcaseAgent): Showcase {
  return { ...current, agents: [...current.agents, agent] };
}

export function replaceAgent(
  current: Showcase,
  agent: ShowcaseAgent,
): Showcase {
  return {
    ...current,
    agents: current.agents.map((row) => (row.id === agent.id ? agent : row)),
  };
}

/**
 * Remove an agent, and take it out of every team that named it.
 *
 * A team holding an id that no longer resolves would render a member count that
 * does not match its list — the kind of inconsistency that looks like a rendering
 * bug rather than stale data.
 */
export function removeAgent(current: Showcase, id: string): Showcase {
  return {
    ...current,
    agents: current.agents.filter((row) => row.id !== id),
    agentTeams: current.agentTeams.map((team) => ({
      ...team,
      agentIds: team.agentIds.filter((agentId) => agentId !== id),
    })),
  };
}

/**
 * Pause or resume an agent.
 *
 * Pausing clears the activity line: an agent that is stopped is not still
 * "reviewing #42", and leaving the sentence there is how a paused agent reads as
 * a stuck one.
 */
export function setAgentPaused(
  current: Showcase,
  id: string,
  paused: boolean,
): Showcase {
  return {
    ...current,
    agents: current.agents.map((row) =>
      row.id === id
        ? {
            ...row,
            status: paused ? "paused" : "idle",
            activity: paused ? null : row.activity,
          }
        : row,
    ),
  };
}

/**
 * The defaults every local agent inherits.
 *
 * Replaced whole rather than patched field by field: the panel edits a working
 * copy and commits it on save, so a partial merge would let a field the reader
 * cleared quietly keep its old value.
 */
export function setAgentDefaults(
  current: Showcase,
  defaults: AgentDefaults,
): Showcase {
  return { ...current, agentDefaults: defaults };
}
