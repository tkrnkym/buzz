/**
 * Fixtures for the screens that exist only as mock-ups.
 *
 * The original desktop client had Agents, Projects, Workflows, Pulse,
 * Reminders, Forum, Huddle and member management. Their relay-side kinds mostly
 * exist, but this client has no data path for them yet — so the screens are
 * built for real and fed from here.
 *
 * The seam is deliberate and one-directional: a screen reads
 * {@link useShowcase} and gets either these fixtures (demo build) or `null`
 * (everything else), and renders an honest "not wired up yet" state in the
 * second case. Shipping invented projects and agents to someone using the real
 * relay would be a lie the UI tells on every load, so it does not happen.
 *
 * Shapes are modelled on the desktop client's own screens rather than invented,
 * so replacing this module with a relay-backed hook is a swap and not a rewrite.
 */

import type { StepForm, TriggerForm } from "@/features/workflows/workflow-form";
import {
  AGENT_RELEASE,
  AGENT_REVIEWER,
  AGENT_TRIAGE,
  AYA,
  KEN,
  MISAKI,
  RELAY,
} from "@/mock/demo-data";

const now = Math.floor(Date.now() / 1000);
/** Minutes ago, so the demo always looks alive regardless of when it loads. */
const ago = (minutes: number) => now - minutes * 60;
/** Minutes from now, for the states that are still running when the demo opens. */
const ahead = (minutes: number) => now + minutes * 60;

export type AgentStatus = "working" | "idle" | "paused" | "error";

export interface ShowcaseAgent {
  id: string;
  pubkey: string;
  name: string;
  /** One line about what this agent is for. */
  purpose: string;
  /** The harness it runs under — `sprig`, `acp`, or a custom command. */
  harness: string;
  model: string;
  status: AgentStatus;
  /** Channels it has been added to, by name. */
  channels: string[];
  /** What it is doing right now, when working. */
  activity: string | null;
  lastActiveAt: number;
  /** Who created it. */
  ownerPubkey: string;
  turnsToday: number;
}

export interface ShowcaseAgentTeam {
  id: string;
  name: string;
  description: string;
  agentIds: string[];
}

export type ProjectItemState = "open" | "in_review" | "merged" | "closed";

export interface ProjectIssue {
  id: string;
  number: number;
  title: string;
  state: ProjectItemState;
  authorPubkey: string;
  assigneePubkey: string | null;
  labels: string[];
  commentCount: number;
  updatedAt: number;
}

export interface ProjectPullRequest {
  id: string;
  number: number;
  title: string;
  state: ProjectItemState;
  authorPubkey: string;
  branch: string;
  additions: number;
  deletions: number;
  /** Review approvals so far. */
  approvals: number;
  checksPassing: boolean;
  updatedAt: number;
}

export interface ProjectBranch {
  name: string;
  aheadBy: number;
  behindBy: number;
  lastCommitAt: number;
  lastCommitBy: string;
}

export interface ProjectActivityEntry {
  id: string;
  kind: "commit" | "issue" | "pull_request" | "review" | "agent";
  actorPubkey: string;
  summary: string;
  at: number;
}

export interface ShowcaseProject {
  id: string;
  name: string;
  description: string;
  repo: string;
  defaultBranch: string;
  openIssues: number;
  openPullRequests: number;
  memberPubkeys: string[];
  updatedAt: number;
  issues: ProjectIssue[];
  pullRequests: ProjectPullRequest[];
  branches: ProjectBranch[];
  activity: ProjectActivityEntry[];
}

export type WorkflowRunState = "succeeded" | "failed" | "running" | "waiting";

export interface WorkflowStep {
  id: string;
  name: string;
  /** `run`, `post`, `agent`, `approve` — what the step does. */
  action: string;
  /** The evalexpr condition guarding it, if any. */
  condition: string | null;
  state: WorkflowRunState;
  durationMs: number | null;
}

export interface WorkflowRun {
  id: string;
  state: WorkflowRunState;
  startedAt: number;
  durationMs: number;
  trigger: string;
  steps: WorkflowStep[];
}

/**
 * The definition a workflow was built with, kept so it can be edited again.
 *
 * Type-only, from the builder's own model rather than restated here: a copy would
 * drift the moment a step field is added, and drift in this direction is silent —
 * the extra field would simply not survive a round-trip. `workflow-form.ts` imports
 * nothing, so this does not put the fixtures in a cycle.
 */
export interface WorkflowDefinition {
  trigger: TriggerForm;
  steps: StepForm[];
}

export interface ShowcaseWorkflow {
  id: string;
  name: string;
  description: string;
  /** `webhook`, `schedule`, `event` — what starts it. */
  trigger: string;
  triggerDetail: string;
  enabled: boolean;
  channel: string;
  /**
   * What the builder submitted, when this row came from the builder.
   *
   * Absent on seeded rows, which only ever recorded what *ran* — those still open
   * with their steps approximated from history. Present means the definition is
   * authoritative and edits round-trip exactly.
   */
  definition?: WorkflowDefinition;
  lastRun: WorkflowRun | null;
  runs: WorkflowRun[];
  /** Runs held for a human decision. */
  pendingApprovals: number;
}

export type PulseTab = "all" | "notes" | "agents";

export interface PulseEntry {
  id: string;
  tab: Exclude<PulseTab, "all">;
  authorPubkey: string;
  title: string;
  body: string;
  channel: string | null;
  at: number;
  /**
   * How an agent's run ended. Absent on notes — a note is something someone
   * chose to write down, not a task that can fail.
   *
   * Without it a failed run is indistinguishable from a finished one: both
   * arrive as a title and a paragraph, and "ハーネスの起動に失敗しました" reads
   * as ordinary prose in the same muted grey as everything else.
   */
  outcome?: "ok" | "failed";
  /**
   * `count` is everyone; `mine` is whether the reader is one of them.
   *
   * Without the second field a chip cannot tell joining from withdrawing, and a
   * click on a reaction two other people hold reads as removing one of theirs.
   */
  reactions: { emoji: string; count: number; mine?: boolean }[];
}

export interface Reminder {
  id: string;
  /** What the reminder points back at. */
  subject: string;
  channel: string;
  /** Snooze target. */
  dueAt: number;
  createdAt: number;
  done: boolean;
}

export interface ForumPost {
  id: string;
  title: string;
  body: string;
  authorPubkey: string;
  channel: string;
  at: number;
  replyCount: number;
  /** `mine` for the same reason the Pulse chips carry it — see `PulseEntry`. */
  reactions: { emoji: string; count: number; mine?: boolean }[];
  pinned: boolean;
  comments: {
    id: string;
    authorPubkey: string;
    body: string;
    at: number;
  }[];
}

export interface HuddleParticipant {
  pubkey: string;
  speaking: boolean;
  muted: boolean;
  /** An agent joins a huddle as a listener with a transcript. */
  isAgent: boolean;
}

export interface HuddleState {
  channel: string;
  startedAt: number;
  participants: HuddleParticipant[];
}

export type MemberRole = "owner" | "admin" | "member";

export interface CommunityMember {
  pubkey: string;
  role: MemberRole;
  joinedAt: number;
  /** Present when the member is under a moderation timeout. */
  timeoutUntil: number | null;
}

/**
 * An agent harness — the runtime that actually executes an agent's turns.
 *
 * `available` is the whole point of the list: a harness the machine does not have
 * installed is still worth showing, because the reader's next question is how to
 * get it. Hiding it would turn "not installed" into "does not exist".
 */
export interface Harness {
  id: string;
  name: string;
  command: string;
  version: string | null;
  available: boolean;
  /** Where to get it, for one that is not installed. */
  installUrl: string;
  /** Added by the reader rather than shipped in the catalog. */
  custom?: boolean;
}

/** Defaults an agent inherits unless it overrides them. */
export interface AgentDefaults {
  provider: string;
  model: string;
  effort: "low" | "medium" | "high";
  harnessId: string;
  env: { key: string; value: string; secret: boolean }[];
}

/**
 * A channel template: the rooms someone creates over and over.
 *
 * Carries the agents to invite as well as the topic, because the reason to keep
 * a template is rarely the name — it is not having to re-add the same three
 * agents each time.
 */
export interface ChannelTemplate {
  id: string;
  name: string;
  topic: string;
  visibility: "open" | "private";
  agentIds: string[];
  usedCount: number;
}

/** A machine sharing inference capacity with the community. */
export interface MeshNode {
  status: "off" | "starting" | "serving";
  model: string;
  maxVramGb: number;
  servingRequests: number;
  /** Null when nothing is downloading. */
  download: { model: string; receivedBytes: number; totalBytes: number } | null;
  installedModels: string[];
  /**
   * Models worth suggesting, with the size they need loaded.
   *
   * The size is the point: the screen ranks these against a memory budget so the
   * reader can see which ones their machine can actually serve, rather than picking
   * a name and finding out when sharing starts.
   */
  catalog: { ref: string; sizeGb: number }[];
}

/** A standing request to keep copies of some events locally. */
export interface ArchiveSubscription {
  id: string;
  scope: string;
  kinds: number[];
  events: number;
  lastSyncedAt: number;
}

/** An archived identity — a member who left, whose history is kept. */
export interface ArchivedIdentity {
  pubkey: string;
  /**
   * When they joined, kept so restoring them is lossless.
   *
   * An archive that drops the join date cannot put a member back — the only
   * values left to pick from are the archive time, which says they joined the
   * moment they left, and today, which says they were never here before. Both
   * are wrong, so the date travels with the archive.
   */
  joinedAt: number;
  archivedAt: number;
  archivedBy: string;
  reason: string | null;
}

/** One of an agent's memories (NIP kind 30174 engram). */
/**
 * One thing an agent did, as the transcript shows it.
 *
 * Modelled on the desktop client's `AgentActivityDescriptor`: a render class
 * decides the shape of the row, and a tone says whether the action read
 * something, wrote something, or touched the community's configuration. Those
 * are separate because "wrote a file" and "renamed a channel" are both writes
 * but want different colours, and because an operator scanning a long run is
 * looking for the writes.
 */
export type SessionRenderClass =
  | "message"
  | "shell"
  | "file-edit"
  | "file-read"
  | "relay-op"
  | "thought"
  | "plan"
  | "permission"
  | "error";

export type SessionTone = "read" | "write" | "admin" | "neutral";

export type SessionStatus = "running" | "done" | "failed";

/** A shell command and what it printed. */
export interface ShellDetail {
  kind: "shell";
  command: string;
  output: string;
  exitCode: number;
}

/** An edit, as the lines that changed. */
export interface DiffDetail {
  kind: "diff";
  path: string;
  /** `+`/`-`/` ` prefixed lines, the way a unified diff carries them. */
  lines: string[];
}

/** A plan, as the steps and which one is current. */
export interface TodoDetail {
  kind: "todo";
  items: { text: string; done: boolean }[];
}

export type SessionDetail = ShellDetail | DiffDetail | TodoDetail;

export interface AgentSessionEvent {
  /** Monotonic within one agent's session, which is what orders the list. */
  seq: number;
  at: number;
  renderClass: SessionRenderClass;
  tone: SessionTone;
  status: SessionStatus;
  /** The one-line summary, always shown. */
  label: string;
  /** A second line, shown when there is something worth previewing. */
  preview: string | null;
  /** The expandable body. Absent for rows that are only a label. */
  detail?: SessionDetail;
}

export interface MemoryEntry {
  slug: string;
  body: string;
  updatedAt: number;
}

/** A community this reader can switch to. */
export interface ShowcaseCommunity {
  id: string;
  name: string;
  relayUrl: string;
  memberCount: number;
  /** Hosted communities are provisioned rather than self-run. */
  hosted: boolean;
  joinPolicy: "open" | "invite" | "closed";
}

export interface Showcase {
  agents: ShowcaseAgent[];
  agentTeams: ShowcaseAgentTeam[];
  projects: ShowcaseProject[];
  workflows: ShowcaseWorkflow[];
  pulse: PulseEntry[];
  reminders: Reminder[];
  forum: ForumPost[];
  huddle: HuddleState;
  members: CommunityMember[];
  harnesses: Harness[];
  agentDefaults: AgentDefaults;
  channelTemplates: ChannelTemplate[];
  mesh: MeshNode;
  archiveSubscriptions: ArchiveSubscription[];
  archivedIdentities: ArchivedIdentity[];
  /** Keyed by agent pubkey. */
  agentMemories: Record<string, MemoryEntry[]>;
  /** Keyed by agent id — what each one has been doing, oldest first. */
  agentSessions: Record<string, AgentSessionEvent[]>;
  communities: ShowcaseCommunity[];
}

export const SHOWCASE: Showcase = {
  agents: [
    {
      id: "agent-reviewer",
      pubkey: AGENT_REVIEWER,
      name: "レビュー係",
      purpose: "PR を読んで、危ないところだけ指摘する",
      harness: "sprig",
      model: "claude-opus-5",
      status: "working",
      channels: ["dev", "general"],
      activity: "#dev の PR #218 を読んでいます",
      lastActiveAt: ago(1),
      ownerPubkey: MISAKI,
      turnsToday: 34,
    },
    {
      id: "agent-release",
      pubkey: AGENT_RELEASE,
      name: "リリース番",
      purpose: "タグを切って、リリースノートの下書きを置く",
      harness: "acp",
      model: "claude-sonnet-5",
      status: "idle",
      channels: ["announcements"],
      activity: null,
      lastActiveAt: ago(180),
      ownerPubkey: KEN,
      turnsToday: 2,
    },
    {
      id: "agent-triage",
      pubkey: AGENT_TRIAGE,
      name: "トリアージ",
      purpose: "新しい Issue にラベルを付けて担当を提案する",
      harness: "custom: ./bin/triage",
      model: "claude-haiku-4-5",
      status: "error",
      channels: ["dev"],
      activity: null,
      lastActiveAt: ago(52),
      ownerPubkey: AYA,
      turnsToday: 0,
    },
  ],
  agentTeams: [
    {
      id: "team-release",
      name: "リリースチーム",
      description: "レビューからタグ付けまでを順に回す",
      agentIds: ["agent-reviewer", "agent-release"],
    },
  ],
  projects: [
    {
      id: "project-nuxx",
      name: "nuxx",
      description: "リレーと web クライアント本体",
      repo: "tkrnkym/nuxx",
      defaultBranch: "main",
      openIssues: 3,
      openPullRequests: 2,
      memberPubkeys: [MISAKI, KEN, AYA],
      updatedAt: ago(12),
      issues: [
        {
          id: "issue-218",
          number: 218,
          title: "スレッドの未読が既読にならないことがある",
          state: "open",
          authorPubkey: AYA,
          assigneePubkey: KEN,
          labels: ["bug", "web"],
          commentCount: 4,
          updatedAt: ago(35),
        },
        {
          id: "issue-221",
          number: 221,
          title: "チャンネル一覧の並び順を選べるようにする",
          state: "open",
          authorPubkey: KEN,
          assigneePubkey: null,
          labels: ["enhancement"],
          commentCount: 1,
          updatedAt: ago(220),
        },
        {
          id: "issue-209",
          number: 209,
          title: "招待リンクの有効期限を設定で変えられるように",
          state: "closed",
          authorPubkey: MISAKI,
          assigneePubkey: MISAKI,
          labels: ["enhancement", "relay"],
          commentCount: 7,
          updatedAt: ago(1_400),
        },
      ],
      pullRequests: [
        {
          id: "pr-224",
          number: 224,
          title: "タイムラインを仮想スクロールにする",
          state: "in_review",
          authorPubkey: KEN,
          branch: "web/virtual-timeline",
          additions: 412,
          deletions: 188,
          approvals: 1,
          checksPassing: true,
          updatedAt: ago(12),
        },
        {
          id: "pr-223",
          number: 223,
          title: "カスタム絵文字（NIP-30）",
          state: "open",
          authorPubkey: MISAKI,
          branch: "web/custom-emoji",
          additions: 760,
          deletions: 24,
          approvals: 0,
          checksPassing: false,
          updatedAt: ago(96),
        },
        {
          id: "pr-219",
          number: 219,
          title: "メンションと `p` タグ",
          state: "merged",
          authorPubkey: KEN,
          branch: "web/mentions",
          additions: 980,
          deletions: 61,
          approvals: 2,
          checksPassing: true,
          updatedAt: ago(600),
        },
      ],
      branches: [
        {
          name: "main",
          aheadBy: 0,
          behindBy: 0,
          lastCommitAt: ago(30),
          lastCommitBy: MISAKI,
        },
        {
          name: "web/virtual-timeline",
          aheadBy: 6,
          behindBy: 1,
          lastCommitAt: ago(12),
          lastCommitBy: KEN,
        },
        {
          name: "web/custom-emoji",
          aheadBy: 11,
          behindBy: 4,
          lastCommitAt: ago(96),
          lastCommitBy: MISAKI,
        },
      ],
      activity: [
        {
          id: "act-1",
          kind: "pull_request",
          actorPubkey: KEN,
          summary: "#224 タイムラインを仮想スクロールにする を更新しました",
          at: ago(12),
        },
        {
          id: "act-2",
          kind: "agent",
          actorPubkey: AGENT_REVIEWER,
          summary: "#224 に 3 件の指摘を残しました",
          at: ago(18),
        },
        {
          id: "act-3",
          kind: "commit",
          actorPubkey: MISAKI,
          summary: "main に 2 コミットを push しました",
          at: ago(30),
        },
        {
          id: "act-4",
          kind: "issue",
          actorPubkey: AYA,
          summary: "#218 スレッドの未読が既読にならないことがある を開きました",
          at: ago(35),
        },
        {
          id: "act-5",
          kind: "review",
          actorPubkey: MISAKI,
          summary: "#219 メンションと `p` タグ を承認しました",
          at: ago(620),
        },
      ],
    },
    {
      id: "project-mobile",
      name: "mobile",
      description: "Flutter クライアント",
      repo: "tkrnkym/nuxx",
      defaultBranch: "main",
      openIssues: 1,
      openPullRequests: 0,
      memberPubkeys: [AYA, KEN],
      updatedAt: ago(2_600),
      issues: [
        {
          id: "issue-231",
          number: 231,
          title: "ペアリング画面の導線を作り直す",
          state: "open",
          authorPubkey: AYA,
          assigneePubkey: AYA,
          labels: ["mobile", "design"],
          commentCount: 2,
          updatedAt: ago(2_600),
        },
      ],
      pullRequests: [],
      branches: [
        {
          name: "main",
          aheadBy: 0,
          behindBy: 0,
          lastCommitAt: ago(2_600),
          lastCommitBy: AYA,
        },
      ],
      activity: [
        {
          id: "act-m1",
          kind: "issue",
          actorPubkey: AYA,
          summary: "#231 ペアリング画面の導線を作り直す を開きました",
          at: ago(2_600),
        },
      ],
    },
  ],
  workflows: [
    {
      id: "wf-release",
      name: "金曜リリース",
      description: "main が緑なら、タグを切って #announcements に流す",
      trigger: "schedule",
      triggerDetail: "毎週金曜 10:00",
      enabled: true,
      channel: "announcements",
      pendingApprovals: 1,
      lastRun: null,
      runs: [
        {
          id: "run-r1",
          state: "waiting",
          startedAt: ago(40),
          durationMs: 0,
          trigger: "毎週金曜 10:00",
          steps: [
            {
              id: "s1",
              name: "CI の状態を読む",
              action: "run",
              condition: null,
              state: "succeeded",
              durationMs: 4_200,
            },
            {
              id: "s2",
              name: "リリースノートを書く",
              action: "agent",
              condition: 'ci_status == "green"',
              state: "succeeded",
              durationMs: 31_800,
            },
            {
              id: "s3",
              name: "人の承認を待つ",
              action: "approve",
              condition: null,
              state: "waiting",
              durationMs: null,
            },
            {
              id: "s4",
              name: "タグを切って告知する",
              action: "post",
              condition: "approved",
              state: "waiting",
              durationMs: null,
            },
          ],
        },
        {
          id: "run-r0",
          state: "succeeded",
          startedAt: ago(10_120),
          durationMs: 96_400,
          trigger: "毎週金曜 10:00",
          steps: [],
        },
      ],
    },
    {
      id: "wf-triage",
      name: "Issue トリアージ",
      description: "新しい Issue にラベルを付け、担当を提案する",
      trigger: "webhook",
      triggerDetail: "POST /hooks/triage",
      enabled: true,
      channel: "dev",
      pendingApprovals: 0,
      lastRun: null,
      runs: [
        {
          id: "run-t1",
          state: "failed",
          startedAt: ago(52),
          durationMs: 2_100,
          trigger: "POST /hooks/triage",
          steps: [
            {
              id: "t1",
              name: "Issue を読む",
              action: "run",
              condition: null,
              state: "succeeded",
              durationMs: 900,
            },
            {
              id: "t2",
              name: "ラベルを付ける",
              action: "agent",
              condition: null,
              state: "failed",
              durationMs: 1_200,
            },
          ],
        },
      ],
    },
    {
      id: "wf-standup",
      name: "朝の要約",
      description: "前日の #dev をまとめて投稿する",
      trigger: "schedule",
      triggerDetail: "平日 09:00",
      enabled: false,
      channel: "dev",
      pendingApprovals: 0,
      lastRun: null,
      runs: [],
    },
  ],
  pulse: [
    {
      id: "pulse-1",
      tab: "agents",
      authorPubkey: AGENT_REVIEWER,
      title: "#224 のレビューを終えました",
      outcome: "ok",
      body: "気になったのは 3 点です。仮想化したあとの日付見出しが sticky を失っている件は、追従ピルで代替されているので問題ありません。",
      channel: "dev",
      at: ago(18),
      reactions: [
        { emoji: "👀", count: 2 },
        { emoji: "👍", count: 1 },
      ],
    },
    {
      id: "pulse-2",
      tab: "notes",
      authorPubkey: MISAKI,
      title: "リリース手順のメモ",
      body: "タグを切る前に `just ci` を通す。落ちていたら金曜を飛ばして月曜にする。",
      channel: null,
      at: ago(120),
      reactions: [{ emoji: "🙏", count: 3 }],
    },
    {
      id: "pulse-3",
      tab: "notes",
      authorPubkey: AYA,
      title: "文字サイズの決めごと",
      body: "本文は text-base、時刻とバッジは text-2xs。px 直書きはズームに追従しないので CI で落ちます。",
      channel: "design",
      at: ago(1_050),
      reactions: [],
    },
    {
      id: "pulse-4",
      tab: "agents",
      authorPubkey: AGENT_TRIAGE,
      title: "トリアージが止まっています",
      outcome: "failed",
      body: "ハーネスの起動に失敗しました。`./bin/triage` が見つかりません。",
      channel: "dev",
      at: ago(52),
      reactions: [],
    },
  ],
  reminders: [
    {
      id: "rem-1",
      subject: "#dev の「シャードの計算、これで合ってますか？」に返す",
      channel: "dev",
      dueAt: ago(-45),
      createdAt: ago(200),
      done: false,
    },
    {
      id: "rem-2",
      subject: "#224 のレビュー指摘に対応する",
      channel: "dev",
      dueAt: ago(-600),
      createdAt: ago(20),
      done: false,
    },
    {
      id: "rem-3",
      subject: "リリースノートを読む",
      channel: "announcements",
      dueAt: ago(300),
      createdAt: ago(1_200),
      done: true,
    },
  ],
  forum: [
    {
      id: "post-1",
      title: "web クライアントの残タスクと優先順位",
      body: "M3 まででチャットまわりは一通り揃いました。次に手を付けるなら agents だと考えています。理由は、元のクライアントで一番使われていた機能で、リレー側（`nuxx-acp` / `nuxx-agent`）はもう動くからです。\n\n異論があれば金曜までにこのスレッドへお願いします。",
      authorPubkey: MISAKI,
      channel: "dev",
      at: ago(90),
      replyCount: 2,
      reactions: [
        { emoji: "👍", count: 4 },
        { emoji: "🎉", count: 1 },
      ],
      pinned: true,
      comments: [
        {
          id: "comment-1",
          authorPubkey: KEN,
          body: "賛成です。ただ agents の前に notifications を入れたほうが、agents の完成度を測りやすいと思います。",
          at: ago(70),
        },
        {
          id: "comment-2",
          authorPubkey: AYA,
          body: "デザイン側は agents のカードだけ先に固めておきます。",
          at: ago(55),
        },
      ],
    },
    {
      id: "post-2",
      title: "デザインシステムの決めごと（随時更新）",
      body: "配色は Catppuccin（Latte / Macchiato）。文字サイズは rem トークンのみ。角丸は `--radius` から。",
      authorPubkey: AYA,
      channel: "design",
      at: ago(1_100),
      replyCount: 0,
      reactions: [{ emoji: "💜", count: 2 }],
      pinned: false,
      comments: [],
    },
  ],
  huddle: {
    channel: "dev",
    startedAt: ago(6),
    participants: [
      { pubkey: MISAKI, speaking: true, muted: false, isAgent: false },
      { pubkey: KEN, speaking: false, muted: false, isAgent: false },
      { pubkey: AYA, speaking: false, muted: true, isAgent: false },
      {
        pubkey: AGENT_REVIEWER,
        speaking: false,
        muted: true,
        isAgent: true,
      },
    ],
  },
  members: [
    {
      pubkey: MISAKI,
      role: "owner",
      joinedAt: ago(60 * 24 * 200),
      timeoutUntil: null,
    },
    {
      pubkey: KEN,
      role: "admin",
      joinedAt: ago(60 * 24 * 180),
      timeoutUntil: null,
    },
    {
      pubkey: AYA,
      role: "member",
      // One member under a running timeout. `timeoutUntil` existed on the type
      // from the start and nothing ever rendered it, so the state a moderator
      // creates was invisible everywhere in the client — the roster is where it
      // belongs, since "can this person speak here" is the roster's question.
      joinedAt: ago(60 * 24 * 90),
      timeoutUntil: ahead(23),
    },
    {
      pubkey: RELAY,
      role: "admin",
      joinedAt: ago(60 * 24 * 210),
      timeoutUntil: null,
    },
  ],

  // One harness missing on purpose. A catalog where everything is installed
  // never shows the state a reader actually arrives in.
  harnesses: [
    {
      id: "claude-code",
      name: "Claude Code",
      command: "claude",
      version: "2.4.1",
      available: true,
      installUrl: "https://claude.com/claude-code",
    },
    {
      id: "codex",
      name: "Codex CLI",
      command: "codex",
      version: "0.48.0",
      available: true,
      installUrl: "https://github.com/openai/codex",
    },
    {
      id: "gemini-cli",
      name: "Gemini CLI",
      command: "gemini",
      version: null,
      available: false,
      installUrl: "https://github.com/google-gemini/gemini-cli",
    },
    {
      id: "sprig",
      name: "sprig",
      command: "sprig",
      version: "0.9.2",
      available: true,
      installUrl: "https://github.com/tkrnkym/nuxx",
      custom: true,
    },
  ],

  agentDefaults: {
    provider: "anthropic",
    model: "claude-opus-5",
    effort: "medium",
    harnessId: "claude-code",
    env: [
      { key: "NUXX_RELAY_URL", value: "wss://relay.example.jp", secret: false },
      { key: "ANTHROPIC_API_KEY", value: "sk-ant-…", secret: true },
    ],
  },

  channelTemplates: [
    {
      id: "tpl-incident",
      name: "障害対応",
      topic: "一次対応と時系列の記録",
      visibility: "private",
      agentIds: ["agent-triage", "agent-release"],
      usedCount: 7,
    },
    {
      id: "tpl-review",
      name: "リリースレビュー",
      topic: "リリース前の確認",
      visibility: "open",
      agentIds: ["agent-reviewer"],
      usedCount: 12,
    },
    {
      id: "tpl-onboarding",
      name: "新メンバー受け入れ",
      topic: "最初の一週間",
      visibility: "private",
      agentIds: [],
      usedCount: 3,
    },
  ],

  mesh: {
    status: "serving",
    model: "qwen3-coder:30b",
    maxVramGb: 24,
    servingRequests: 3,
    // A download in flight, because the idle state says nothing about progress.
    download: {
      model: "deepseek-r1:14b",
      receivedBytes: 6_100_000_000,
      totalBytes: 9_000_000_000,
    },
    installedModels: ["qwen3-coder:30b", "llama3.3:70b"],
    // Sized so the list spans all three fits against the 24 GB cap above: two that
    // are comfortable, one that is tight, one that will not load. A catalog where
    // everything fits never shows the state the screen is for.
    catalog: [
      { ref: "llama3.2:3b", sizeGb: 2.2 },
      { ref: "qwen3-coder:30b", sizeGb: 16 },
      { ref: "deepseek-r1:14b", sizeGb: 9 },
      { ref: "llama3.3:70b", sizeGb: 40 },
    ],
  },

  archiveSubscriptions: [
    {
      id: "arc-general",
      scope: "#general",
      kinds: [9, 40002, 40099],
      events: 12_480,
      lastSyncedAt: ago(4),
    },
    {
      id: "arc-agent-frames",
      scope: "自分のエージェントのセッション",
      kinds: [20100],
      events: 3_204,
      lastSyncedAt: ago(11),
    },
  ],

  archivedIdentities: [
    {
      pubkey: "9".repeat(64),
      joinedAt: ago(60 * 24 * 400),
      archivedAt: ago(60 * 24 * 45),
      archivedBy: MISAKI,
      reason: "退職",
    },
  ],

  agentMemories: {
    [AGENT_REVIEWER]: [
      {
        slug: "mem/core",
        body: "このコミュニティのレビュー方針。[[mem/style/japanese]] と [[mem/policy/tests]] を守る。",
        updatedAt: ago(60 * 24 * 12),
      },
      {
        slug: "mem/style/japanese",
        body: "レビューコメントは敬体。指摘は理由とセットで書く。",
        updatedAt: ago(60 * 24 * 12),
      },
      {
        slug: "mem/policy/tests",
        body: "テストのない変更は原則指摘する。ただし設定ファイルのみの変更は除く。[[mem/policy/exceptions]]",
        updatedAt: ago(60 * 24 * 3),
      },
      {
        // Reachable from nothing — an orphan, which the viewer lists separately.
        slug: "mem/notes/scratch",
        body: "リリース手順のメモ。あとで整理する。",
        updatedAt: ago(60 * 24 * 30),
      },
    ],
    [AGENT_TRIAGE]: [
      {
        slug: "mem/core",
        body: "受け付けた不具合の振り分け方。[[mem/labels]]",
        updatedAt: ago(60 * 24 * 5),
      },
      {
        slug: "mem/labels",
        body: "bug / enhancement / question の三つに寄せる。判断に迷ったら question。",
        updatedAt: ago(60 * 24 * 5),
      },
    ],
  },

  // What each agent has been doing. Oldest first, so the list reads downward like
  // a log rather than a feed — an operator following a run wants the newest at the
  // bottom, where the cursor already is.
  agentSessions: {
    "agent-reviewer": [
      {
        seq: 1,
        at: ago(9),
        renderClass: "plan",
        tone: "neutral",
        status: "done",
        label: "やることを決めました",
        preview: "PR #218 を読む → 危ない箇所を拾う → #dev に返す",
        detail: {
          kind: "todo",
          items: [
            { text: "差分を読む", done: true },
            { text: "テストの有無を確認する", done: true },
            { text: "指摘を #dev に書く", done: false },
          ],
        },
      },
      {
        seq: 2,
        at: ago(8),
        renderClass: "shell",
        tone: "read",
        status: "done",
        label: "git diff を実行しました",
        preview: "3 ファイル / +128 −14",
        detail: {
          kind: "shell",
          command: "git diff --stat origin/main...HEAD",
          output: [
            " crates/nuxx-relay/src/router.rs   | 96 ++++++++++++++---",
            " crates/nuxx-relay/src/read.rs     | 32 +++---",
            " crates/nuxx-core/src/kind.rs      | 14 ++-",
            " 3 files changed, 128 insertions(+), 14 deletions(-)",
          ].join("\n"),
          exitCode: 0,
        },
      },
      {
        seq: 3,
        at: ago(7),
        renderClass: "file-read",
        tone: "read",
        status: "done",
        label: "crates/nuxx-relay/src/read.rs を読みました",
        preview: "32 行の変更を含む範囲",
      },
      {
        seq: 4,
        at: ago(6),
        renderClass: "thought",
        tone: "neutral",
        status: "done",
        label: "読み取りカーソルの更新が、公開の成否を待っていません",
        preview:
          "拒否されたときにカーソルだけ進むので、次に開いたとき既読になってしまいます",
      },
      {
        seq: 5,
        at: ago(5),
        renderClass: "file-edit",
        tone: "write",
        status: "done",
        label: "crates/nuxx-relay/src/read.rs を直しました",
        preview: "+4 −2",
        detail: {
          kind: "diff",
          path: "crates/nuxx-relay/src/read.rs",
          lines: [
            " async fn advance_cursor(&self, req: CursorReq) -> Result<()> {",
            "-    self.store.set_cursor(req.channel, req.at).await?;",
            "-    self.publish(req).await",
            '+    // The cursor is what the reader sees as "already read", so it must',
            "+    // not move until the relay has taken the event.",
            "+    self.publish(req.clone()).await?;",
            "+    self.store.set_cursor(req.channel, req.at).await",
            " }",
          ],
        },
      },
      {
        seq: 6,
        at: ago(2),
        renderClass: "permission",
        tone: "admin",
        status: "done",
        label: "#dev への書き込みを許可されました",
        preview: "佐藤 美咲 が承認",
      },
      {
        seq: 7,
        at: ago(1),
        renderClass: "message",
        tone: "write",
        status: "running",
        label: "#dev に返信しています",
        preview: "read.rs の 41 行目、カーソルの更新が公開より先です",
      },
    ],
    "agent-release": [
      {
        seq: 1,
        at: ago(190),
        renderClass: "shell",
        tone: "read",
        status: "done",
        label: "タグを確認しました",
        preview: "v0.9.3 が最新",
        detail: {
          kind: "shell",
          command: "git tag --sort=-v:refname | head -3",
          output: "v0.9.3\nv0.9.2\nv0.9.1",
          exitCode: 0,
        },
      },
      {
        seq: 2,
        at: ago(185),
        renderClass: "relay-op",
        tone: "admin",
        status: "done",
        label: "#announcements に下書きを置きました",
        preview: "リリースノート v0.9.4（下書き）",
      },
    ],
    "agent-triage": [
      {
        seq: 1,
        at: ago(55),
        renderClass: "shell",
        tone: "read",
        status: "done",
        label: "ハーネスを起動しました",
        preview: "./bin/triage --once",
        detail: {
          kind: "shell",
          command: "./bin/triage --once",
          output: "loading model claude-haiku-4-5…",
          exitCode: 0,
        },
      },
      {
        seq: 2,
        at: ago(52),
        renderClass: "error",
        tone: "neutral",
        status: "failed",
        label: "ハーネスが終了しました",
        preview: "exit 127: ./bin/triage: No such file or directory",
        detail: {
          kind: "shell",
          command: "./bin/triage --once",
          output: "sh: ./bin/triage: No such file or directory",
          exitCode: 127,
        },
      },
    ],
  },

  communities: [
    {
      id: "community-nuxx",
      name: "Nuxx 開発",
      relayUrl: "wss://relay.example.jp",
      memberCount: 24,
      hosted: false,
      joinPolicy: "invite",
    },
    {
      id: "community-design",
      name: "デザイン部",
      relayUrl: "wss://design.nuxx.host",
      memberCount: 8,
      hosted: true,
      joinPolicy: "open",
    },
  ],
};
