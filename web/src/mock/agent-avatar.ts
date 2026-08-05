/**
 * Placeholder avatar images for showcase agents.
 *
 * The desktop client gives each agent an illustrated mascot icon; this repo
 * has no such asset, so a small fixed palette of flat-colour SVG discs stands
 * in instead — through the same `avatarUrl` prop `PubkeyAvatar` already
 * renders a person's kind:0 picture with, so swapping in real artwork later
 * touches no consumer.
 *
 * Deterministic per agent id rather than random: a reload must not reshuffle
 * which agent looks like which.
 */

const PALETTE: ReadonlyArray<{ bg: string; fg: string }> = [
  { bg: "#eab308", fg: "#422006" },
  { bg: "#f97316", fg: "#431407" },
  { bg: "#3b82f6", fg: "#172554" },
  { bg: "#10b981", fg: "#022c22" },
  { bg: "#a855f7", fg: "#3b0764" },
  { bg: "#ec4899", fg: "#500724" },
];

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index++) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

/** A round, two-eyed face — legible at avatar size without being a person. */
function svgAvatar(bg: string, fg: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">` +
    `<circle cx="32" cy="32" r="32" fill="${bg}"/>` +
    `<circle cx="22" cy="27" r="5" fill="${fg}"/>` +
    `<circle cx="42" cy="27" r="5" fill="${fg}"/>` +
    `<path d="M20 41q12 9 24 0" stroke="${fg}" stroke-width="4" fill="none" stroke-linecap="round"/>` +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** The avatar image for one agent, stable across reloads. */
export function agentAvatarUrl(agentId: string): string {
  const { bg, fg } = PALETTE[hashString(agentId) % PALETTE.length];
  return svgAvatar(bg, fg);
}
