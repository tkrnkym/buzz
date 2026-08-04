/**
 * Experiments: features that work but are still moving.
 *
 * Real flags with real consumers, not a list of switches. Each one gates a section
 * of the app — its nav row and its route — so turning it off actually removes the
 * thing. A flag nothing reads is the mistake this codebase has already made once
 * with the theme tokens.
 *
 * Per-browser, and on by default: everything listed here already ships. The flag
 * exists so a reader who does not use Projects can take its row out of the sidebar,
 * and so a section that turns out to be a problem can be turned off without a
 * release.
 */

export type FeatureFlag =
  | "workflows"
  | "projects"
  | "pulse"
  | "forum"
  | "agentProfiles";

export interface FeatureFlagInfo {
  id: FeatureFlag;
  label: string;
  description: string;
}

export const FEATURE_FLAGS: ReadonlyArray<FeatureFlagInfo> = [
  {
    id: "workflows",
    label: "Workflows",
    description: "承認ゲートを持つ YAML の自動化",
  },
  {
    id: "projects",
    label: "Projects",
    description: "Git リポジトリの閲覧と共同作業",
  },
  {
    id: "pulse",
    label: "Pulse",
    description: "ノートとエージェントの動きが流れるフィード",
  },
  {
    id: "forum",
    label: "Forum Channels",
    description: "長い議論のための、フォーラム型のチャンネル",
  },
  {
    id: "agentProfiles",
    label: "Agent-managed profiles",
    description:
      "エージェントが自分の名前とアイコンをリレー上で自分で管理します",
  },
];

export type FeatureFlagState = Record<FeatureFlag, boolean>;

export const DEFAULT_FLAGS: FeatureFlagState = {
  workflows: true,
  projects: true,
  pulse: true,
  forum: true,
  agentProfiles: true,
};

export const FEATURE_FLAGS_KEY = "nuxx-experiments.v1";

/**
 * Read the stored flags, merged over the defaults.
 *
 * Field by field, so a blob written before a flag existed comes back with that flag
 * *on* rather than `undefined` — a new section appearing is recoverable, a section
 * silently missing is the bug nobody reports.
 */
export function readFlags(raw: string | null | undefined): FeatureFlagState {
  if (!raw) return DEFAULT_FLAGS;
  try {
    const parsed = JSON.parse(raw) as Partial<Record<string, unknown>>;
    const merged = { ...DEFAULT_FLAGS };
    for (const flag of FEATURE_FLAGS) {
      const value = parsed[flag.id];
      if (typeof value === "boolean") merged[flag.id] = value;
    }
    return merged;
  } catch {
    return DEFAULT_FLAGS;
  }
}
