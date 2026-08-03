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

export interface ShowcaseWorkflow {
  id: string;
  name: string;
  description: string;
  /** `webhook`, `schedule`, `event` — what starts it. */
  trigger: string;
  triggerDetail: string;
  enabled: boolean;
  channel: string;
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
  reactions: { emoji: string; count: number }[];
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
  reactions: { emoji: string; count: number }[];
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
      joinedAt: ago(60 * 24 * 90),
      timeoutUntil: null,
    },
    {
      pubkey: RELAY,
      role: "admin",
      joinedAt: ago(60 * 24 * 210),
      timeoutUntil: null,
    },
  ],
};
