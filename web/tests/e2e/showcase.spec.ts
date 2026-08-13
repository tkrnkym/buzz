import { expect, test } from "@playwright/test";

/**
 * The mock-up screens, driven against the demo bundle.
 *
 * These screens have no relay path yet: their data comes from
 * `src/mock/showcase.ts` and only exists in a `VITE_MOCK_RELAY=1` build, so this
 * file runs against its own bundle and its own preview server (see the
 * `showcase` project in `playwright.config.ts`). The smoke suite deliberately
 * asserts the opposite — that a build pointed at a real relay says "not
 * connected" rather than showing invented data — and both are worth guarding.
 *
 * What is under test is that the create, edit and delete controls actually
 * change what is on screen. The mutation rules themselves are unit-tested
 * (`showcase-mutations.test.mjs`, `workflow-form.test.mjs`); these are the
 * wiring, which unit tests cannot reach.
 *
 * Fixtures are session-scoped and re-seeded on load, so each test starts from
 * the same data without any cleanup.
 */

// --- Workflows -------------------------------------------------------------

test("a workflow is built from the form and appears in the list", async ({
  page,
}) => {
  await page.goto("/workflows");
  await expect(page.getByTestId("workflow-list")).toBeVisible();

  await page.getByTestId("create-workflow").click();
  await expect(page.getByTestId("workflow-form-dialog")).toBeVisible();

  await page.getByTestId("workflow-name").fill("金曜の締め");
  await page.getByTestId("workflow-description").fill("週末前の確認");
  await page.getByTestId("workflow-trigger").click();
  await page.getByTestId("workflow-trigger-schedule").click();
  await page.getByTestId("trigger-cron").fill("0 17 * * 5");

  await page.getByTestId("add-step").click();
  const step = page.getByTestId(/^step-step-new-/).first();
  await expect(step).toBeVisible();
  const stepId = (await step.getAttribute("data-testid"))?.replace("step-", "");
  await page.getByTestId(`step-channel-${stepId}`).fill("#dev");
  await page.getByTestId(`step-text-${stepId}`).fill("今週の締めです");

  await page.getByTestId("save-workflow").click();
  await expect(page.getByTestId("workflow-form-dialog")).toHaveCount(0);
  await expect(page.getByTestId("workflow-card-金曜の締め")).toBeVisible();
  await expect(
    page.getByTestId("workflow-card-金曜の締め").getByText("週末前の確認"),
  ).toBeVisible();
});

test("a workflow just created reopens with the steps that were entered", async ({
  page,
}) => {
  // The row used to store only summary fields, so reopening a workflow built here
  // showed zero steps and could not be saved until it was rebuilt from nothing.
  await page.goto("/workflows");
  await page.getByTestId("create-workflow").click();
  await page.getByTestId("workflow-name").fill("承認つきリリース");
  await page.getByTestId("workflow-trigger").click();
  await page.getByTestId("workflow-trigger-webhook").click();

  await page.getByTestId("add-step").click();
  const first = page.getByTestId(/^step-step-new-/).first();
  const firstId = (await first.getAttribute("data-testid"))?.replace(
    "step-",
    "",
  );
  await page.getByTestId(`step-channel-${firstId}`).fill("#dev");
  await page.getByTestId(`step-text-${firstId}`).fill("リリースを始めます");

  // A second step on an action whose fields are its own, so the reopened form has
  // to restore more than one shape.
  await page.getByTestId("add-step").click();
  const second = page.getByTestId(/^step-step-new-/).nth(1);
  const secondId = (await second.getAttribute("data-testid"))?.replace(
    "step-",
    "",
  );
  await page
    .getByTestId(`step-action-${secondId}`)
    .selectOption("request_approval");
  await page.getByTestId(`step-from-${secondId}`).fill("@release-manager");
  await page
    .getByTestId(`step-message-${secondId}`)
    .fill("リリースしてよいですか");

  await page.getByTestId("save-workflow").click();
  await expect(page.getByTestId("workflow-form-dialog")).toHaveCount(0);

  await page.getByTestId("workflow-card-承認つきリリース").click();
  await page.getByTestId("edit-workflow").click();
  await expect(page.getByTestId("workflow-form-dialog")).toBeVisible();

  // The stored definition keeps each step's id, so the same fields are addressable.
  await expect(page.getByTestId(/^step-step-/)).toHaveCount(2);
  // The row shows the stored trigger rather than carrying a form value.
  await expect(page.getByTestId("workflow-trigger")).toContainText("Webhook");
  await expect(page.getByTestId(`step-text-${firstId}`)).toHaveValue(
    "リリースを始めます",
  );
  await expect(page.getByTestId(`step-action-${secondId}`)).toHaveValue(
    "request_approval",
  );
  await expect(page.getByTestId(`step-from-${secondId}`)).toHaveValue(
    "@release-manager",
  );
  await expect(page.getByTestId(`step-message-${secondId}`)).toHaveValue(
    "リリースしてよいですか",
  );
});

test("an incomplete workflow names everything missing at once", async ({
  page,
}) => {
  await page.goto("/workflows");
  await page.getByTestId("create-workflow").click();

  // Nothing red before the first Save: an empty form is not a wrong form.
  await expect(page.getByTestId("workflow-problems")).toHaveCount(0);

  await page.getByTestId("add-step").click();
  await page.getByTestId("save-workflow").click();

  // The form-level problem (no name) and the step-level one (no text) both show,
  // rather than one Save per problem.
  await expect(page.getByTestId("workflow-problems")).toContainText("名前");
  const step = page.getByTestId(/^step-step-new-/).first();
  await expect(step).toContainText("本文");
  await expect(page.getByTestId("workflow-form-dialog")).toBeVisible();
});

test("the YAML behind the form is what the form says", async ({ page }) => {
  await page.goto("/workflows");
  await page.getByTestId("create-workflow").click();
  await page.getByTestId("workflow-name").fill("毎朝の要約");
  await page.getByTestId("workflow-trigger").click();
  await page.getByTestId("workflow-trigger-schedule").click();
  await page.getByTestId("trigger-cron").fill("0 9 * * 1-5");

  await page.getByTestId("toggle-yaml").click();
  const yaml = page.getByTestId("workflow-yaml");
  await expect(yaml).toContainText('name: "毎朝の要約"');
  // Quoted, because a cron expression can start with `*`, which YAML reads as an
  // alias reference.
  await expect(yaml).toContainText('cron: "0 9 * * 1-5"');
});

test("a step moves, and cannot move off the end", async ({ page }) => {
  await page.goto("/workflows");
  await page.getByTestId("create-workflow").click();
  await page.getByTestId("add-step").click();
  await page.getByTestId("add-step").click();

  const steps = page.getByTestId(/^step-step-new-/);
  await expect(steps).toHaveCount(2);
  const first = (await steps.first().getAttribute("data-testid")) ?? "";
  const firstId = first.replace("step-", "");

  await expect(page.getByTestId(`step-up-${firstId}`)).toBeDisabled();
  await page.getByTestId(`step-down-${firstId}`).click();
  await expect(steps.nth(1)).toHaveAttribute("data-testid", first);
  await expect(page.getByTestId(`step-down-${firstId}`)).toBeDisabled();
});

test("a workflow is edited, stopped, and deleted", async ({ page }) => {
  await page.goto("/workflows/wf-triage");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Issue トリアージ",
  );

  await page.getByTestId("edit-workflow").click();
  await page.getByTestId("workflow-name").fill("Issue の振り分け");
  await page.getByTestId("save-workflow").click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Issue の振り分け",
  );

  await page.getByTestId("toggle-workflow-enabled").click();
  await expect(page.getByTestId("toggle-workflow-enabled")).toHaveText("再開");

  await page.getByTestId("delete-workflow").click();
  await page.getByTestId("confirm-delete-workflow").click();
  // Leaves the page, because it is about to have nothing to render.
  await expect(page).toHaveURL(/\/workflows$/);
  await expect(page.getByTestId("workflow-card-Issue の振り分け")).toHaveCount(
    0,
  );
});

test("a run held for approval is resolved from the detail page", async ({
  page,
}) => {
  await page.goto("/workflows");
  // The fixture whose latest run is waiting on someone.
  await page.getByTestId("workflow-card-金曜リリース").click();

  const approval = page.getByTestId("workflow-approval");
  await expect(approval).toBeVisible();
  await page.getByTestId("approve-run").click();
  await expect(approval).toHaveCount(0);
});

// --- Agents ----------------------------------------------------------------

test("an agent is created with the channels it will speak in", async ({
  page,
}) => {
  await page.goto("/agents");
  await page.getByTestId("create-agent").click();

  // Name and purpose are both required — an agent with no stated purpose is a
  // row nobody can act on later.
  await expect(page.getByTestId("save-agent")).toBeDisabled();
  await page.getByTestId("agent-name").fill("当番くん");
  await expect(page.getByTestId("save-agent")).toBeDisabled();
  await page.getByTestId("agent-purpose").fill("朝の当番を割り振る");
  await page.getByTestId("agent-channel-general").click();
  await expect(page.getByTestId("save-agent")).toBeEnabled();

  await page.getByTestId("save-agent").click();
  await expect(page.getByTestId("agent-form-dialog")).toHaveCount(0);
  await expect(page.getByTestId("agent-list")).toContainText("当番くん");
});

test("an agent is renamed, paused, and deleted", async ({ page }) => {
  await page.goto("/agents");
  const panel = page.getByTestId("agent-detail-panel");
  await expect(panel).toBeVisible();
  const original = await panel.getByRole("heading").first().innerText();

  await page.getByTestId("edit-agent").click();
  await page.getByTestId("agent-name").fill("改名した係");
  await page.getByTestId("save-agent").click();
  await expect(panel).toContainText("改名した係");

  await page.getByTestId("toggle-agent-paused").click();
  await expect(page.getByTestId("toggle-agent-paused")).toHaveText("再開");

  await page.getByTestId("delete-agent").click();
  await expect(page.getByTestId("agent-list")).not.toContainText("改名した係");
  await expect(page.getByTestId("agent-list")).not.toContainText(original);
});

test("the card's own badge and menu run the same actions as the panel", async ({
  page,
}) => {
  // The card gained a run badge and a ⋮ menu, which are two more entry points
  // into the same three mutations. They call the shared handlers rather than
  // their own copies, and this is what says so — in particular that pausing from
  // the card still pins the selection, since the list is sorted by status and
  // reorders underneath the click.
  await page.goto("/agents");
  const panel = page.getByTestId("agent-detail-panel");
  const name = await panel.getByRole("heading").first().innerText();

  // Pause from the panel first, so the run badge exists regardless of what state
  // the fixtures put this agent in. The badge appears only where it changes
  // something — a resume on an already-idle agent would be a no-op button — and
  // that rule is asserted at the end.
  const panelToggle = page.getByTestId("toggle-agent-paused");
  await panelToggle.click();
  await expect(panelToggle).toHaveText("再開");

  const badge = page.getByTestId(`agent-run-${name}`);
  await expect(badge).toHaveAttribute("aria-label", `${name} を再開`);
  await badge.click();
  await expect(panelToggle).toHaveText("一時停止");
  // Still the same agent, not whichever one the re-sort put first.
  await expect(panel.getByRole("heading").first()).toHaveText(name);
  // Resuming lands on idle, which is neither running nor paused, so there is
  // nothing for the badge to do and it is not drawn.
  await expect(badge).toHaveCount(0);

  await page.getByTestId(`agent-menu-${name}`).click();
  await page.getByTestId(`agent-card-edit-${name}`).click();
  await page.getByTestId("agent-name").fill("カードから改名");
  await page.getByTestId("save-agent").click();
  await expect(page.getByTestId("agent-list")).toContainText("カードから改名");

  await page.getByTestId("agent-menu-カードから改名").click();
  await page.getByTestId("agent-card-delete-カードから改名").click();
  await expect(page.getByTestId("agent-list")).not.toContainText(
    "カードから改名",
  );
});

test("an agent's run is shown as what it actually did", async ({ page }) => {
  // The surface the desktop client had and this one did not. Without it the screen
  // can say an agent is working but never what it is doing.
  await page.goto("/agents");
  await page.getByTestId("agent-select-レビュー係").click();
  await page.getByTestId("agent-tab-session").click();

  const transcript = page.getByTestId("agent-session-transcript");
  await expect(transcript).toBeVisible();
  await expect(transcript).toContainText("git diff を実行しました");
  await expect(transcript).toContainText("#dev に返信しています");

  // A shell command's output is behind a disclosure, because eight of them open
  // at once is a wall.
  await expect(page.getByTestId("session-detail-2")).toHaveCount(0);
  await page.getByTestId("session-toggle-2").click();
  await expect(page.getByTestId("session-detail-2")).toContainText(
    "3 files changed",
  );

  // An edit shows the lines that changed, with its own +/− count.
  await page.getByTestId("session-toggle-5").click();
  const diff = page.getByTestId("session-detail-5");
  await expect(diff).toContainText("crates/nuxx-relay/src/read.rs");
  await expect(diff).toContainText("+4");
  await expect(diff).toContainText("−2");
});

test("a failed run opens its reason without being asked", async ({ page }) => {
  // The reason is the only thing the reader came for, so it is not behind a click.
  await page.goto("/agents");
  await page.getByTestId("agent-select-トリアージ").click();
  await page.getByTestId("agent-tab-session").click();
  await expect(page.getByTestId("session-detail-2")).toContainText("exit 127");
});

test("replaying a run reveals it one step at a time", async ({ page }) => {
  // A transcript that is complete on arrival shows the shape of the feature but
  // not the thing it is for. The count is state the panel owns, so nothing here
  // waits on a timer.
  await page.goto("/agents");
  await page.getByTestId("agent-select-リリース番").click();
  await page.getByTestId("agent-tab-session").click();
  await expect(page.getByTestId("session-event-2")).toBeVisible();

  // At the end the control restarts, which is what makes it demonstrable twice.
  await page.getByTestId("replay-session").click();
  await expect(page.getByTestId("session-event-1")).toBeVisible();
  await expect(page.getByTestId("session-event-2")).toHaveCount(0);
  await page.getByTestId("replay-session").click();
  await expect(page.getByTestId("session-event-2")).toBeVisible();
});

test("the grid's add card creates an agent too", async ({ page }) => {
  // On a screen whose subject is a grid, the way to get another one belongs in
  // the grid — not only in the header.
  await page.goto("/agents");
  await page.getByTestId("create-agent-card").click();
  await expect(page.getByTestId("agent-form-dialog")).toBeVisible();

  await page.getByTestId("agent-name").fill("グリッドから");
  await page.getByTestId("agent-purpose").fill("追加カードの動作確認");
  await page.getByTestId("agent-channel-general").click();
  await page.getByTestId("save-agent").click();
  await expect(page.getByTestId("agent-list")).toContainText("グリッドから");
});

test("an evaluation is shown with its sample size, not as a bare rate", async ({
  page,
}) => {
  // The two ways this display lies are a percentage with no denominator, and
  // one merged figure made of numbers that different parties measured. Both are
  // asserted against here.
  await page.goto("/agents");
  await page.getByTestId("agent-select-レビュー係").click();

  const card = page.getByTestId("evaluation-card");
  await expect(card).toBeVisible();

  // The publisher's 231/300 and this workspace's 9/11 both appear, separately.
  await expect(card).toContainText("231/300");
  await expect(card).toContainText("9/11");
  await expect(card).toContainText("提供元による評価");
  await expect(card).toContainText("このWorkspaceでの評価");

  // Only the under-thirty result is qualified, and it says so in words.
  await expect(
    card.getByTestId("evaluation-eval-reviewer-workspace-qualifier"),
  ).toHaveText("暫定");
  await expect(
    card.getByTestId("evaluation-eval-reviewer-publisher-qualifier"),
  ).toHaveCount(0);

  // Same dataset and agent version, different model — two rows, not one sum.
  await expect(card).toContainText("claude-opus-5");
  await expect(card).toContainText("claude-sonnet-5");
  await expect(card).toContainText("34/50");
  await expect(card).toContainText("27/50");
  // 34+27=61 is the figure a merge would produce, and nobody measured it.
  await expect(card).not.toContainText("61/100");
});

test("an agent nobody has evaluated says so rather than showing nothing", async ({
  page,
}) => {
  await page.goto("/agents");
  await page.getByTestId("agent-select-トリアージ").click();
  await expect(page.getByTestId("evaluation-unevaluated")).toContainText(
    "未評価",
  );
  await expect(page.getByTestId("evaluation-card")).toHaveCount(0);
});

// --- Projects --------------------------------------------------------------

test("a project is created and opens on its own page", async ({ page }) => {
  await page.goto("/projects");
  await page.getByTestId("create-project").click();

  await page.getByTestId("create-project-dialog-name").fill("台帳");
  await page.getByTestId("create-project-dialog-repo").fill("tkrnkym/ledger");
  await page.getByTestId("create-project-dialog-submit").click();

  await expect(page.getByTestId("project-card-台帳")).toBeVisible();
  await page.getByTestId("project-card-台帳").click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("台帳");
  // A new project starts genuinely empty rather than with invented history.
  await expect(page.getByTestId("project-tab-issues")).toHaveText("Issue (0)");
});

test("an issue is created, and closing it moves the open count", async ({
  page,
}) => {
  await page.goto("/projects/project-nuxx");
  const issuesTab = page.getByTestId("project-tab-issues");
  const before = Number(
    (await issuesTab.innerText()).replace(/[^0-9]/g, "") || "0",
  );

  await page.getByTestId("new-issue").click();
  await page
    .getByTestId("create-issue-dialog-title")
    .fill("再現手順が足りない");
  await page.getByTestId("create-issue-dialog-labels").fill("bug, docs");
  await page.getByTestId("create-issue-dialog-submit").click();

  // Lands on the tab it was created in, so the new row is visible without a
  // second click.
  await expect(page.getByTestId("project-issues")).toContainText(
    "再現手順が足りない",
  );
  await expect(issuesTab).toHaveText(`Issue (${before + 1})`);
  await expect(page.getByTestId("project-issues")).toContainText("docs");

  const row = page
    .getByTestId("project-issues")
    .locator("li")
    .filter({ hasText: "再現手順が足りない" });
  await row.getByRole("button", { name: "閉じる" }).click();
  await expect(issuesTab).toHaveText(`Issue (${before})`);
  await expect(row.getByRole("button", { name: "開き直す" })).toBeVisible();
});

test("a pull request is created, and merging it takes it out of the count", async ({
  page,
}) => {
  await page.goto("/projects/project-nuxx");
  const pullsTab = page.getByTestId("project-tab-pulls");
  const before = Number(
    (await pullsTab.innerText()).replace(/[^0-9]/g, "") || "0",
  );

  await page.getByTestId("new-pull-request").click();
  await page.getByTestId("create-pull-dialog-title").fill("手順を書き足す");
  await page.getByTestId("create-pull-dialog-branch").fill("docs/repro");
  await page.getByTestId("create-pull-dialog-submit").click();

  const row = page
    .getByTestId("project-pull-requests")
    .locator("li")
    .filter({ hasText: "手順を書き足す" });
  await expect(row).toBeVisible();
  // A branch nobody has run CI on is not passing, and the row says so.
  await expect(row).toContainText("CI 失敗");
  await expect(pullsTab).toHaveText(`PR (${before + 1})`);

  await row.getByRole("button", { name: "マージ" }).click();
  await expect(pullsTab).toHaveText(`PR (${before})`);
  await expect(row.getByRole("button", { name: "マージ" })).toHaveCount(0);
});

// --- Forum -----------------------------------------------------------------

test("a forum post is written, commented on, pinned, and deleted", async ({
  page,
}) => {
  await page.goto("/forum");
  await page.getByTestId("create-forum-post").click();
  await page.getByTestId("create-forum-dialog-title").fill("命名を揃えたい");
  await page.getByTestId("create-forum-dialog-body").fill("ばらついています。");
  await page.getByTestId("create-forum-dialog-submit").click();

  // Opens on what was just written, rather than leaving the reader to find it.
  const thread = page.getByTestId("forum-thread-panel");
  await expect(thread).toContainText("命名を揃えたい");

  await page.getByTestId("forum-comment-input").fill("賛成です");
  await page.getByTestId("forum-comment-submit").click();
  await expect(thread).toContainText("賛成です");
  await expect(page.getByTestId("forum-comment-input")).toHaveValue("");

  await page.getByTestId("toggle-pin").click();
  await expect(page.getByTestId("toggle-pin")).toHaveAttribute(
    "aria-label",
    "固定を解除",
  );

  await page.getByTestId("delete-forum-post").click();
  await expect(page.getByTestId("forum-thread-panel")).toHaveCount(0);
  await expect(page.getByTestId("forum-list")).not.toContainText(
    "命名を揃えたい",
  );
});

// --- Reminders -------------------------------------------------------------

test("a reminder is snoozed, finished, and removed", async ({ page }) => {
  await page.goto("/reminders");
  const row = page.getByTestId("reminder-rem-1");
  await expect(row).toContainText("あと 45分");

  // Measured from now rather than added to the old due time, so an hour's snooze
  // means an hour from now.
  await page.getByTestId("snooze-60-rem-1").click();
  await expect(row).toContainText("あと 1時間");

  await page.getByTestId("toggle-reminder-rem-1").click();
  await expect(page.getByTestId("toggle-reminder-rem-1")).toHaveAttribute(
    "aria-label",
    "未完了に戻す",
  );
  // A finished reminder has nothing left to snooze.
  await expect(page.getByTestId("snooze-60-rem-1")).toHaveCount(0);

  await page.getByTestId("toggle-reminder-rem-1").click();
  await page.getByTestId("remove-reminder-rem-1").click();
  await expect(page.getByTestId("reminder-rem-1")).toHaveCount(0);
});

// --- Members ---------------------------------------------------------------

/** The fixture owner, spelled the same way `src/mock/demo-data.ts` spells it. */
const MISAKI = "a11ce".padEnd(64, "a");

test("a member is added, promoted, and removed", async ({ page }) => {
  await page.goto("/settings/invites");
  const members = page.getByTestId("members-settings");
  await expect(members).toBeVisible();

  const newcomer = "ab".repeat(32);
  await page.getByTestId("add-member").click();
  await page.getByTestId("add-member-dialog-pubkey").fill(newcomer);
  await page.getByTestId("add-member-dialog-submit").click();
  await expect(page.getByTestId(`member-role-${newcomer}`)).toHaveValue(
    "member",
  );

  await page.getByTestId(`member-role-${newcomer}`).selectOption("admin");
  await expect(page.getByTestId(`member-role-${newcomer}`)).toHaveValue(
    "admin",
  );

  await page.getByTestId(`remove-member-${newcomer}`).click();
  await expect(page.getByTestId(`member-role-${newcomer}`)).toHaveCount(0);
});

test("the last owner cannot be demoted or removed", async ({ page }) => {
  await page.goto("/settings/invites");

  const owner = page.getByTestId(`member-role-${MISAKI}`);
  await expect(owner).toHaveValue("owner");

  await owner.selectOption("member");
  // Refused and said so, rather than silently ignored: a community with no owner
  // has nobody who can promote one.
  await expect(page.getByText("最後のオーナーは降格できません")).toBeVisible();
  await expect(owner).toHaveValue("owner");

  await page.getByTestId(`remove-member-${MISAKI}`).click();
  await expect(page.getByText("最後のオーナーは外せません")).toBeVisible();
  await expect(owner).toBeVisible();
});

// --- Huddle ----------------------------------------------------------------

/**
 * #dev, where the fixture huddle is and the two assigned agents are. The huddle
 * bar and the roster both only render inside a channel.
 */
const CH_DEV = "22222222-2222-4222-8222-222222222222";

test("an agent is called into the huddle, and joins muted", async ({
  page,
}) => {
  await page.goto(`/c/${CH_DEV}`);
  const bar = page.getByTestId("huddle-bar");
  await expect(bar).toBeVisible();
  const roster = bar.getByRole("list", { name: "参加者" }).locator("li");
  const before = await roster.count();
  const mutedBefore = await bar.getByLabel("ミュート中").count();

  await page.getByTestId("huddle-add-agent").click();
  await page.getByTestId("huddle-invite-agent-triage").click();
  await expect(roster).toHaveCount(before + 1);
  // Listening, not talking, the moment it arrives.
  await expect(bar.getByLabel("ミュート中")).toHaveCount(mutedBefore + 1);
});

test("an agent already in the huddle is not offered again", async ({
  page,
}) => {
  await page.goto(`/c/${CH_DEV}`);
  await page.getByTestId("huddle-add-agent").click();
  // The reviewer is in the fixture call; offering it would be a menu item that
  // cannot do anything.
  await expect(page.getByTestId("huddle-invite-agent-reviewer")).toHaveCount(0);
  await expect(page.getByTestId("huddle-invite-agent-triage")).toBeVisible();
});

test("leaving the huddle takes the bar away", async ({ page }) => {
  await page.goto(`/c/${CH_DEV}`);
  await expect(page.getByTestId("huddle-bar")).toBeVisible();
  await page.getByTestId("huddle-leave").click();
  await expect(page.getByTestId("huddle-bar")).toHaveCount(0);
});

// --- Pulse -----------------------------------------------------------------

test("a reaction is added and withdrawn", async ({ page }) => {
  await page.goto("/pulse");
  const entry = page.getByTestId("pulse-entry-pulse-1");
  await expect(entry).toBeVisible();

  await page.getByTestId("pulse-add-reaction-pulse-1-🎉").click();
  const chip = page.getByTestId("pulse-reaction-pulse-1-🎉");
  await expect(chip).toContainText("1");

  // A reaction nobody holds is not a reaction: the chip goes rather than showing 0.
  await chip.click();
  await expect(page.getByTestId("pulse-reaction-pulse-1-🎉")).toHaveCount(0);
  await expect(page.getByTestId("pulse-add-reaction-pulse-1-🎉")).toBeVisible();
});

test("an existing reaction can be joined, then withdrawn", async ({ page }) => {
  await page.goto("/pulse");
  const chip = page
    .getByTestId("pulse-entry-pulse-1")
    .getByTestId(/^pulse-reaction-/)
    .first();
  const before = Number((await chip.innerText()).replace(/[^0-9]/g, ""));

  // Seeded by other people and not by the reader, so this click joins them. It
  // counted *down* before, which read as deleting someone else's reaction.
  await expect(chip).toHaveAttribute("aria-pressed", "false");
  await chip.click();
  await expect(chip).toContainText(String(before + 1));
  await expect(chip).toHaveAttribute("aria-pressed", "true");

  // And clicking again withdraws only the reader's own.
  await chip.click();
  await expect(chip).toContainText(String(before));
  await expect(chip).toHaveAttribute("aria-pressed", "false");
});

// --- Identity: membership ids, not keys ------------------------------------

/**
 * A run of hex long enough to be a key or a slice of one.
 *
 * No `\b` anchors: a truncated key rendered next to another string has no word
 * boundary in front of it, which is exactly the case this missed on the first
 * attempt — `mem_0qs4e0w99999999…` matched nothing at all.
 */
const HEX_RUN = /[0-9a-f]{8,}/;

for (const [name, path] of [
  ["the channel", "/c/22222222-2222-4222-8222-222222222222"],
  ["the agents screen", "/agents"],
  ["the inbox", "/home"],
  ["the repo list", "/repos"],
  ["the invites screen", "/settings/invites"],
  ["the local archive", "/settings/archive"],
] as const) {
  test(`${name} names people by membership, never by key`, async ({ page }) => {
    // §7 demotes the pubkey to a verification attribute. The check is on the
    // rendered text rather than on any one component, because the ways a key
    // reached the screen were spread across a tooltip, an avatar's initials,
    // and five separate truncation call sites.
    //
    // What this does *not* cover: paths the fixtures never reach. Every person
    // in the demo has a display name, so an avatar's initials fallback and
    // `resolveUserLabel`'s last resort are both unreachable here — reverting
    // either to a key does not fail this test. The pure-function tests in
    // `membership.test.mjs` are what hold those.
    await page.goto(path);
    await page.waitForTimeout(400);
    // `textContent`, not `innerText`: the latter reports only what is laid out,
    // so anything below the fold escaped it — which is how the first version of
    // this check passed while a truncated key sat in the archive list.
    const text = (await page.locator("body").textContent()) ?? "";
    const hex = text.match(HEX_RUN);
    expect(
      hex,
      hex ? `a key-shaped string reached the screen: ${hex[0]}` : "",
    ).toBeNull();
  });
}

test("an agent is identified by its membership, not its signing key", async ({
  page,
}) => {
  await page.goto("/agents");
  await page.getByTestId("agent-select-レビュー係").click();
  const panel = page.getByTestId("agent-detail-panel");
  await expect(panel).toContainText("Membership ID");
  await expect(panel).not.toContainText("公開鍵");
});

// --- Channel canvas --------------------------------------------------------

test("the canvas holds what is true, beside the stream of what happened", async ({
  page,
}) => {
  await page.goto("/c/77777777-7777-4777-8777-777777777777");
  await page.getByTestId("toggle-canvas").click();

  const panel = page.getByTestId("canvas-panel");
  await expect(panel).toBeVisible();
  await expect(panel.getByTestId("canvas-body")).toContainText("恒久対応");
  // Last editor and revision, since a canvas belongs to the room rather than
  // to whoever started it.
  await expect(panel.getByTestId("canvas-meta")).toContainText("第3版");
});

test("an edit bumps the revision and survives leaving the room", async ({
  page,
}) => {
  const room = "/c/77777777-7777-4777-8777-777777777777";
  await page.goto(room);
  await page.getByTestId("toggle-canvas").click();
  await page.getByTestId("edit-canvas").click();
  await page.getByTestId("canvas-editor").fill("# 差し替え\n\n新しい内容");
  await page.getByTestId("save-canvas").click();

  const panel = page.getByTestId("canvas-panel");
  await expect(panel.getByTestId("canvas-body")).toContainText("新しい内容");
  await expect(panel.getByTestId("canvas-meta")).toContainText("第4版");

  // Navigated in-app, not by reloading: the showcase store is session-scoped
  // and a reload re-seeds the fixtures by design, so `goto` would test the
  // seeding rather than whether the edit survived leaving the room.
  await page.getByTestId("channel-dev").click();
  await expect(page.getByTestId("canvas-panel")).toHaveCount(0);
  await page.getByTestId("channel-incident-0731").click();
  // The pane is keyed by channel, so returning to the room reopens it where it
  // was left — no second toggle, which would close it again.
  await expect(page.getByTestId("canvas-body")).toContainText("新しい内容");
});

test("a room with no canvas says so rather than showing an empty document", async ({
  page,
}) => {
  await page.goto("/c/22222222-2222-4222-8222-222222222222");
  await page.getByTestId("toggle-canvas").click();
  await expect(page.getByTestId("canvas-empty")).toContainText("まだ空です");
  await expect(page.getByTestId("canvas-body")).toHaveCount(0);
});

test("the canvas and the roster take turns rather than crowding the timeline", async ({
  page,
}) => {
  // Two 384px panels beside the timeline on a 1280px window leave it narrower
  // than either, so opening one closes the other.
  await page.goto("/c/77777777-7777-4777-8777-777777777777");
  await page.getByTestId("toggle-canvas").click();
  await expect(page.getByTestId("canvas-panel")).toBeVisible();

  await page.getByTestId("toggle-roster").click();
  await expect(page.getByTestId("roster-panel")).toBeVisible();
  await expect(page.getByTestId("canvas-panel")).toHaveCount(0);

  // And the toggle closes it rather than only ever opening.
  await page.getByTestId("toggle-canvas").click();
  await expect(page.getByTestId("canvas-panel")).toBeVisible();
  await page.getByTestId("toggle-canvas").click();
  await expect(page.getByTestId("canvas-panel")).toHaveCount(0);
});

// --- Making a private channel public ---------------------------------------

const CH_INCIDENT = "77777777-7777-4777-8777-777777777777";

test("a credential in the history stops the channel being published", async ({
  page,
}) => {
  // The seeded room holds an API key. There is no second approver and no
  // waiting period behind this dialog, so the scan is the only thing standing
  // between a private history and a public one — and a blocking finding has to
  // be a refusal rather than a warning someone can click past.
  await page.goto(`/c/${CH_INCIDENT}`);
  await page.getByTestId("open-publish-channel").click();

  const dialog = page.getByTestId("publish-channel-dialog");
  await expect(dialog).toBeVisible();

  // The scope comes first: the whole history goes, which is the part people
  // underestimate.
  await expect(dialog.getByTestId("publish-preview")).toContainText(
    "過去の投稿",
  );
  await page.getByTestId("publish-to-findings").click();

  await expect(dialog.getByTestId("publish-findings-summary")).toContainText(
    "公開できません",
  );
  await expect(dialog).toContainText("Anthropic API キー");
  // Redacted — the finding must not be a second copy of the leak.
  await expect(dialog).not.toContainText("AAAABBBBCCCC");

  // And there is no way on. Not a confirm-anyway, not an acknowledgement.
  await expect(page.getByTestId("publish-to-confirm")).toBeDisabled();
  await expect(page.getByTestId("publish-acknowledge")).toHaveCount(0);
  await expect(page.getByTestId("publish-confirm")).toHaveCount(0);
});

test("the scan says it did not send the content anywhere", async ({ page }) => {
  // "検査のために内容を外部AIへ送信しない" is a promise the reader cannot verify
  // by looking, so the screen states it.
  await page.goto(`/c/${CH_INCIDENT}`);
  await page.getByTestId("open-publish-channel").click();
  await page.getByTestId("publish-to-findings").click();
  await expect(page.getByTestId("publish-findings")).toContainText(
    "外部に送信していません",
  );
});

test("a public channel is not offered a way to be published again", async ({
  page,
}) => {
  await page.goto(`/c/${CH_DEV}`);
  await expect(page.getByTestId("open-publish-channel")).toHaveCount(0);
});

// --- Channel roster --------------------------------------------------------

test("a channel says who is in it, with agents kept apart from people", async ({
  page,
}) => {
  // Membership used to be reachable only from Settings, which answers "who is in
  // the community" and not the question someone reading a room has.
  await page.goto(`/c/${CH_DEV}`);
  await page.getByTestId("toggle-roster").click();

  const roster = page.getByTestId("roster-panel");
  await expect(roster).toBeVisible();
  // Counted separately: "6人" for four people and two agents would overstate how
  // many humans are in the room.
  await expect(roster).toContainText("4人・エージェント2");
  await expect(roster.getByTestId(/^roster-person-/)).toHaveCount(4);
  await expect(roster.getByTestId("roster-agent-レビュー係")).toBeVisible();
  await expect(roster.getByTestId("roster-agent-トリアージ")).toBeVisible();
  // An agent assigned only to #announcements is not in this room.
  await expect(roster.getByTestId("roster-agent-リリース番")).toHaveCount(0);
});

test("a channel with no agents shows only its people", async ({ page }) => {
  await page.goto("/c/33333333-3333-4333-8333-333333333333");
  await page.getByTestId("toggle-roster").click();

  const roster = page.getByTestId("roster-panel");
  await expect(roster).toContainText("4人");
  await expect(roster.getByTestId(/^roster-agent-/)).toHaveCount(0);
});

test("a member under a timeout is shown as one", async ({ page }) => {
  // `timeoutUntil` was on the member type from the start and nothing rendered
  // it, so a moderator's timeout was invisible everywhere in the client.
  await page.goto(`/c/${CH_DEV}`);
  await page.getByTestId("toggle-roster").click();

  const timeout = page.getByTestId(/^roster-timeout-/);
  await expect(timeout).toHaveCount(1);
  await expect(timeout).toContainText("タイムアウト中");
});

test("the roster and a thread take turns rather than crowding the timeline", async ({
  page,
}) => {
  // Two 288–384px panels beside the timeline on a 1280px window leave it
  // narrower than either, so opening one has to close the other.
  await page.goto(`/c/${CH_DEV}`);
  // The first row that actually has a reply control: the sidebar's own list
  // items come first in the document, and the timeline's own first item is the
  // "Load older messages" button.
  const row = page
    .getByRole("listitem")
    .filter({ has: page.getByTestId("reply-in-thread") })
    .first();
  await row.hover();
  await row.getByTestId("reply-in-thread").click();
  await expect(page.getByTestId("thread-panel")).toBeVisible();

  await page.getByTestId("toggle-roster").click();
  await expect(page.getByTestId("roster-panel")).toBeVisible();
  await expect(page.getByTestId("thread-panel")).toHaveCount(0);

  // And the button it was opened from closes it again.
  await page.getByTestId("toggle-roster").click();
  await expect(page.getByTestId("roster-panel")).toHaveCount(0);
});

test("the invite link is copied from where a missing person is noticed", async ({
  page,
}) => {
  await page.goto(`/c/${CH_DEV}`);
  await page.getByTestId("toggle-roster").click();
  await page.getByTestId("roster-invite").click();

  // The toast rather than the clipboard: reading it back needs a permission this
  // suite does not grant, and the assertion under test is that the row copies
  // something and says so.
  await expect(page.getByText("招待リンクをコピーしました")).toBeVisible();
  await expect(page.getByTestId("roster-invite")).toContainText(
    "/invite/demo-code",
  );
});

// --- Inbox -----------------------------------------------------------------

test("a mention is read in its conversation without leaving the inbox", async ({
  page,
}) => {
  // The rows used to be links, so reading one mention cost the reader the list
  // they were working through and landed them in a busy channel.
  await page.goto("/home");
  const rows = page.getByTestId("notification-rows");
  await expect(rows).toBeVisible();
  await rows
    .getByTestId(/^notification-/)
    .first()
    .click();

  await expect(page).toHaveURL(/\/home$/);
  const detail = page.getByTestId("inbox-detail");
  await expect(detail.getByTestId("inbox-detail-notification")).toBeVisible();
  // The point of the pane: the message that named the reader, marked, among the
  // messages around it — a mention on its own often answers a question one row up.
  await expect(detail.getByTestId("inbox-detail-subject")).toBeVisible();
  await expect(detail.getByTestId("inbox-open-in-channel")).toBeVisible();
});

test("the inbox opens on a notification rather than on nothing", async ({
  page,
}) => {
  // A pane that starts empty makes the reader click twice to see anything, and a
  // message with their name on it outranks the news that a room moved.
  await page.goto("/home");
  await expect(
    page.getByTestId("inbox-detail").getByTestId("inbox-detail-notification"),
  ).toBeVisible();
  await expect(page.getByTestId("inbox-detail-empty")).toHaveCount(0);
});

test("a room row says only what a room row can know", async ({ page }) => {
  await page.goto("/home");
  await page.getByTestId("inbox-row-design").click();

  const room = page.getByTestId("inbox-detail-room");
  await expect(room).toBeVisible();
  // Room rows come from per-channel activity snapshots, which report that a
  // channel moved and nothing about who said what — so the pane says that
  // instead of inventing a message to preview.
  await expect(room).toContainText("開いて確かめてください");
  await expect(page.getByTestId("inbox-detail-notification")).toHaveCount(0);
});

test("selecting a room and then a mention moves the pane both ways", async ({
  page,
}) => {
  await page.goto("/home");
  await page.getByTestId("inbox-row-design").click();
  await expect(page.getByTestId("inbox-detail-room")).toBeVisible();

  const first = page
    .getByTestId("notification-rows")
    .getByTestId(/^notification-/)
    .first();
  await first.click();
  await expect(page.getByTestId("inbox-detail-notification")).toBeVisible();
  await expect(page.getByTestId("inbox-detail-room")).toHaveCount(0);
  // The selected row is the one lit, so the list still says what the pane shows.
  await expect(first).toHaveAttribute("aria-current", "true");
});

// --- Files -----------------------------------------------------------------

test("a file the reader cannot open shows the lock line and nothing else", async ({
  page,
}) => {
  await page.goto("/files");
  const list = page.getByTestId("file-list");
  await expect(list).toBeVisible();

  const locked = page.getByTestId("file-locked-file-locked");
  await expect(locked).toContainText("このFileを表示する権限がありません");

  // The whole rule. A name alone tells you most of what a document was for, and
  // the size and owner tell you the rest — so none of it may reach the page.
  await expect(list).not.toContainText("決算");
  await expect(list).not.toContainText("xlsx");
  await expect(list).not.toContainText("SharePoint");
  await expect(list).not.toContainText("500.0 KB");
  // And there is no thumbnail or icon standing in for the content either.
  await expect(locked.locator("img")).toHaveCount(0);
});

test("a readable file says where its authoritative copy lives", async ({
  page,
}) => {
  // The link/import distinction is what decides whether a row can go locked
  // tomorrow, so it is stated rather than left to an icon.
  await page.goto("/files");
  await expect(page.getByTestId("file-file-runbook")).toContainText(
    "Nuxx · 取り込み",
  );
  await expect(page.getByTestId("file-file-arch")).toContainText(
    "Google Drive · リンク",
  );
});

test("the count admits how many files are withheld", async ({ page }) => {
  // "4 件" with one hidden would be a lie, and silently showing 3 leaves
  // "why does this say 4" unanswerable.
  await page.goto("/files");
  await expect(page.getByText("うち 1 件は権限がありません")).toBeVisible();
});

// --- Pulse cards and forum reactions ---------------------------------------

test("a stopped agent does not look like a memo", async ({ page }) => {
  // All three entry kinds used to render as the same bordered box with a 10px
  // icon, so "ハーネスの起動に失敗しました" sat in the same muted grey as a
  // style guideline.
  await page.goto("/pulse");
  await expect(page.getByTestId("pulse-kind-pulse-4")).toContainText(
    "止まっています",
  );
  await expect(page.getByTestId("pulse-kind-pulse-1")).toContainText(
    "エージェントの報告",
  );
  await expect(page.getByTestId("pulse-kind-pulse-2")).toContainText("ノート");
  // And the tab says so before it is opened, because that is the reason to open it.
  await expect(page.getByTestId("pulse-tab-agents-alert")).toBeVisible();
});

test("the pulse tabs count what is behind them", async ({ page }) => {
  await page.goto("/pulse");
  // With three unlabelled tabs there is no telling an empty one from one nobody
  // has opened.
  await expect(page.getByTestId("pulse-tab-all")).toContainText("4");
  await expect(page.getByTestId("pulse-tab-notes")).toContainText("2");
  await expect(page.getByTestId("pulse-tab-agents")).toContainText("2");
});

test("an entry that names a room offers the way to it", async ({ page }) => {
  await page.goto("/pulse");
  await page.getByTestId("pulse-open-channel-pulse-4").click();
  await expect(page).toHaveURL(/\/c\/22222222-2222-4222-8222-222222222222/);
});

test("a note written from Pulse appears in the notes tab", async ({ page }) => {
  // Pulse is "things worth keeping" and had no way to keep one.
  await page.goto("/pulse");
  await page.getByTestId("create-pulse-note").click();
  await page.getByTestId("create-pulse-dialog-title").fill("金曜の決めごと");
  await page.getByTestId("create-pulse-dialog-body").fill("タグの前に just ci");
  await page.getByTestId("create-pulse-dialog-submit").click();

  await expect(page.getByText("ノートを追加しました")).toBeVisible();
  // Landed on the notes tab, so the writer sees what they wrote.
  const notes = page.getByTestId("pulse-tab-notes");
  await expect(notes).toContainText("3");
  await expect(page.getByTestId("pulse-list")).toContainText("金曜の決めごと");
});

test("a forum reaction can be given and withdrawn", async ({ page }) => {
  // The forum's counts used to be plain text — the one thing on the screen that
  // turned out not to be real.
  await page.goto("/forum");
  await page.getByTestId("forum-post-post-1").click();

  // The seeded 🎉 is held by someone else, so this joins them rather than
  // walking their count down.
  const seeded = page.getByTestId("forum-reaction-🎉");
  await expect(seeded).toHaveAttribute("aria-pressed", "false");
  await seeded.click();
  await expect(seeded).toContainText("2");
  await expect(seeded).toHaveAttribute("aria-pressed", "true");

  // A fresh one starts at the reader's own single count, and withdrawing takes
  // the chip away: a reaction nobody holds is not a reaction.
  await page.getByTestId("forum-add-reaction-🙏").click();
  const fresh = page.getByTestId("forum-reaction-🙏");
  await expect(fresh).toContainText("1");
  await fresh.click();
  await expect(page.getByTestId("forum-reaction-🙏")).toHaveCount(0);
  await expect(page.getByTestId("forum-add-reaction-🙏")).toBeVisible();
});

// --- Hosted community setup ------------------------------------------------

test("creating a hosted community asks the two questions that matter later", async ({
  page,
}) => {
  // It used to be a name field and a toast, which is enough to name a community
  // and nothing like enough to have one.
  await page.goto("/home");
  await page.getByTestId("add-community").click();
  await page.getByTestId("choose-create").click();

  await page.getByTestId("hosted-name").fill("my-team");
  await page.getByTestId("hosted-next").click();

  // Who can get in. The draft starts invite-only — the safe default for a
  // community that does not exist yet.
  await expect(page.getByTestId("hosted-policy-invite")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByTestId("hosted-policy-open").click();
  await page.getByTestId("hosted-next").click();

  // Who else is in it. Two addresses, pasted with mixed separators.
  await page.getByTestId("hosted-invite-to").fill("a@example.jp, b@example.jp");
  await expect(page.getByTestId("hosted-create")).toContainText("2 人に送る");
  await page.getByTestId("hosted-create").click();

  const done = page.getByTestId("hosted-done");
  await expect(done).toContainText("wss://my-team.nuxx.host");
  await expect(done).toContainText("誰でも参加できます");
  await expect(page.getByTestId("hosted-copy-invite")).toContainText(
    "my-team.nuxx.host/invite/",
  );
});

test("the community it created is in the rail afterwards", async ({ page }) => {
  await page.goto("/home");
  const before = await page
    .getByTestId("community-rail")
    .getByRole("button")
    .count();

  await page.getByTestId("add-community").click();
  await page.getByTestId("choose-create").click();
  await page.getByTestId("hosted-name").fill("my-team");
  await page.getByTestId("hosted-next").click();
  await page.getByTestId("hosted-next").click();
  await page.getByTestId("hosted-create").click();
  await page.getByTestId("hosted-finish").click();

  // A community that was created and then did not appear would read as the
  // creation having failed.
  await expect(page.getByTestId("hosted-flow")).toHaveCount(0);
  await expect(
    page.getByTestId("community-rail").getByRole("button"),
  ).toHaveCount(before + 1);
});

test("a community can be created with nobody invited", async ({ page }) => {
  // Blocking on "invite somebody" would be a demand rather than an offer, and a
  // community of one is a legitimate thing to start.
  await page.goto("/home");
  await page.getByTestId("add-community").click();
  await page.getByTestId("choose-create").click();
  await page.getByTestId("hosted-name").fill("solo-team");
  await page.getByTestId("hosted-next").click();
  await page.getByTestId("hosted-next").click();
  await expect(page.getByTestId("hosted-create")).toContainText("作成する");
  await page.getByTestId("hosted-create").click();
  await expect(page.getByTestId("hosted-done")).toBeVisible();
});

test("the setup flow keeps its light palette rather than following the theme", async ({
  page,
}) => {
  // The `--nuxx-hosted-community-*` tokens were declared with no rule reading
  // them, so this surface rendered in whatever the app theme was. They are
  // declared only on `:root` — deliberately, so they do not vary with the theme —
  // and this asserts the Tailwind mapping resolves them at all: without it the
  // classes would not exist and the colours would simply be inherited.
  await page.goto("/home");
  await page.getByTestId("add-community").click();
  await page.getByTestId("choose-create").click();

  const identity = page.getByTestId("hosted-owner");
  await expect(identity).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(page.getByTestId("hosted-name")).toHaveCSS(
    "color",
    "rgb(23, 23, 23)",
  );
});

// --- Settings panels -------------------------------------------------------

/**
 * These five panels had no coverage in this project at all, which is how they
 * came to behave differently from every other mock-up surface: three controls
 * raised a toast and changed nothing, and four kept their own copy of the list so
 * every edit was discarded when the reader opened another section. Each test below
 * therefore leaves the panel and comes back — the assertion is persistence, not
 * that the click had a visible effect.
 */
async function openSettings(page, panel: string) {
  // A URL per screen now, so this is a navigation rather than a click.
  await page.goto(`/settings/${panel}`);
}

/** Leave the screen and return, which is what used to throw the change away. */
async function leaveAndReturn(page, panel: string) {
  await page.getByTestId("settings-nav-shortcuts").click();
  await page.getByTestId(`settings-nav-${panel}`).click();
}

test("a harness the reader adds stays in the catalog", async ({ page }) => {
  await openSettings(page, "agents");
  await page.getByTestId("add-harness").click();
  await page.getByTestId("harness-name").fill("My CLI");
  await page.getByTestId("harness-command").fill("my-agent --acp");
  await page.getByTestId("save-harness").click();

  const row = page.getByTestId("harness-settings").getByText("My CLI");
  await expect(row).toBeVisible();
  await leaveAndReturn(page, "agents");
  await expect(row).toBeVisible();
});

test("only a harness the reader added offers a delete", async ({ page }) => {
  // The shipped catalog states what exists. Removing an uninstalled entry from it
  // would turn "not installed" into "does not exist".
  await openSettings(page, "agents");
  await expect(page.getByTestId("remove-harness-claude-code")).toHaveCount(0);

  await page.getByTestId("add-harness").click();
  await page.getByTestId("harness-name").fill("Mine");
  await page.getByTestId("harness-command").fill("mine");
  await page.getByTestId("save-harness").click();

  const remove = page.getByTestId(/^remove-harness-harness-/);
  await expect(remove).toHaveCount(1);
  await remove.click();
  await expect(
    page.getByTestId("harness-settings").getByText("Mine"),
  ).toHaveCount(0);
});

test("saved agent defaults survive leaving the panel", async ({ page }) => {
  await openSettings(page, "agents");
  // Nothing to save until something changes.
  await expect(page.getByTestId("save-agent-defaults")).toBeDisabled();

  await page.getByTestId("defaults-model").fill("claude-opus-4");
  await expect(page.getByTestId("save-agent-defaults")).toBeEnabled();
  await page.getByTestId("save-agent-defaults").click();

  await leaveAndReturn(page, "agents");
  await expect(page.getByTestId("defaults-model")).toHaveValue("claude-opus-4");
});

test("discarding agent defaults puts the committed values back", async ({
  page,
}) => {
  await openSettings(page, "agents");
  const before = await page.getByTestId("defaults-model").inputValue();
  await page.getByTestId("defaults-model").fill("throwaway");
  await page.getByTestId("discard-agent-defaults").click();
  await expect(page.getByTestId("defaults-model")).toHaveValue(before);
});

test("an unsaved edit to the defaults is not kept", async ({ page }) => {
  // The panel has a save button, so an edit is a draft until it is pressed. What
  // changed is where the commit goes, not that edits commit themselves.
  await openSettings(page, "agents");
  const before = await page.getByTestId("defaults-model").inputValue();
  await page.getByTestId("defaults-model").fill("never-saved");
  await leaveAndReturn(page, "agents");
  await expect(page.getByTestId("defaults-model")).toHaveValue(before);
});

test("a channel template is created, copied, and deleted for good", async ({
  page,
}) => {
  await openSettings(page, "templates");
  await page.getByTestId("add-template").click();
  await page.getByTestId("template-name").fill("週次の振り返り");
  await page.getByTestId("save-template").click();

  const templates = page.getByTestId("channel-templates");
  await expect(templates).toContainText("週次の振り返り");
  await leaveAndReturn(page, "templates");
  await expect(templates).toContainText("週次の振り返り");

  // A copy sits beside the original and starts with no usage history.
  await page.getByTestId("duplicate-template-tpl-incident").click();
  await expect(templates).toContainText("障害対応 のコピー");
  await leaveAndReturn(page, "templates");
  await expect(templates).toContainText("障害対応 のコピー");

  await page.getByTestId("delete-template-tpl-incident").click();
  await page.getByTestId("confirm-delete-template").click();
  await leaveAndReturn(page, "templates");
  // By row id, not by text: the copy inherited the original's topic, so the
  // words are still on screen while the original itself is gone.
  await expect(page.getByTestId("template-tpl-incident")).toHaveCount(0);
});

test("shared compute remembers the switch and the VRAM cap", async ({
  page,
}) => {
  // The cap is the one control on this screen with a consequence attached, and it
  // was the one that reverted.
  await openSettings(page, "compute");
  // The cap sits under Advanced now: it is the number the suggestions above are
  // judged against, not something most readers touch.
  await page.getByTestId("toggle-compute-advanced").click();
  await page.getByTestId("mesh-vram").fill("32");
  await page.getByTestId("mesh-vram").blur();
  await leaveAndReturn(page, "compute");
  await page.getByTestId("toggle-compute-advanced").click();
  await expect(page.getByTestId("mesh-vram")).toHaveValue("32");

  await page.getByTestId("mesh-share").click();
  await expect(page.getByTestId("mesh-share-row")).toContainText(
    "いまは共有していません",
  );
  await leaveAndReturn(page, "compute");
  await expect(page.getByTestId("mesh-share-row")).toContainText(
    "いまは共有していません",
  );
});

test("turning sharing on says it is starting, not that it is serving", async ({
  page,
}) => {
  // A node has to come up before it can answer anything.
  await openSettings(page, "compute");
  await page.getByTestId("mesh-share").click();
  await page.getByTestId("mesh-share").click();
  await expect(page.getByTestId("mesh-share-row")).toContainText(
    "起動しています",
  );
});

test("an archive subscription can be dropped and a new one started", async ({
  page,
}) => {
  await openSettings(page, "archive");
  await page.getByTestId("remove-archive-arc-general").click();
  const subscriptions = page.getByTestId("archive-subscriptions");
  await expect(subscriptions).not.toContainText("#general");
  await leaveAndReturn(page, "archive");
  await expect(subscriptions).not.toContainText("#general");

  // The kind checkboxes had no action behind them at all, so choosing kinds was a
  // decision the screen threw away.
  await page.getByTestId("start-archiving").click();
  await expect(subscriptions).toContainText("種類");
  await leaveAndReturn(page, "archive");
  await expect(subscriptions).toContainText("種類");
});

test("restoring an archived member puts them back in the member list", async ({
  page,
}) => {
  // An archive is a move, not a flag: doing only half of it would leave the person
  // neither archived nor a member, and so visible nowhere.
  await openSettings(page, "archive");
  const archived = page.getByTestId(/^archived-/);
  await expect(archived).toHaveCount(1);
  await page.getByTestId(/^unarchive-/).click();
  await expect(
    page.getByText("アーカイブされたメンバーはいません"),
  ).toBeVisible();

  await page.getByTestId("settings-nav-invites").click();
  await expect(
    page.getByTestId("members-settings").getByTestId(/^member-role-9{64}$/),
  ).toHaveCount(1);
});

test("a right-hand panel casts the sideways edge its token describes", async ({
  page,
}) => {
  // `shadow-panel-left` was declared with nothing reading it. Tailwind's stock
  // shadows are all y-offset, so a left-facing edge gets almost nothing from them
  // — and a left-only border tapers out at each corner instead of turning it.
  // Asserted on the computed value because a missing class is silent: the panel
  // simply has no edge, which reads as a design choice rather than a bug.
  await page.goto("/agents");
  await page.getByTestId("agent-select-レビュー係").click();

  const shadow = await page
    .getByTestId("agent-detail-panel")
    .evaluate((el) => getComputedStyle(el).boxShadow);
  expect(shadow).not.toBe("none");
  // Both layers run -x, so they wrap the rounded left corners.
  expect(shadow).toContain("-1px");
  expect(shadow).toContain("-16px");
});

// --- Approval policies and secrets -----------------------------------------

test("the approval deadline shortens as the risk rises", async ({ page }) => {
  // The table is the policy. If a destructive operation may wait as long as an
  // ordinary one, the risk classes are decoration.
  await openSettings(page, "security");
  const card = page.getByTestId("approval-deadlines");
  await expect(card.getByTestId("deadline-row-standard")).toContainText("7日");
  await expect(card.getByTestId("deadline-row-destructive")).toContainText(
    "1時間",
  );
});

test("editing the policy bumps the version a run would be pinned to", async ({
  page,
}) => {
  await openSettings(page, "security");
  const version = page.getByTestId("policy-version");
  const before = await version.innerText();

  await page.getByTestId("deadline-standard").click();
  // Options are keyed by their value in seconds; 3 days is 259200.
  await page.getByTestId("deadline-standard-259200").click();
  await expect(version).not.toHaveText(before);
  await leaveAndReturn(page, "security");
  await expect(page.getByTestId("deadline-row-standard")).toContainText("3日");
});

test("the evaluation order ends in a denial rather than a fallthrough", async ({
  page,
}) => {
  await openSettings(page, "security");
  const order = page.getByTestId("evaluation-order");
  // Default Deny is the last row, and an explicit deny sits above every grant.
  await expect(order.getByTestId("stage-default")).toContainText("Deny");
  const stages = await order.locator("[data-testid^='stage-']").allInnerTexts();
  assertOrder(stages, "明示的 Deny", "Role の Capability");
});

test("a secret is stored without ever being displayable again", async ({
  page,
}) => {
  await openSettings(page, "secrets");
  await page.getByTestId("add-secret").click();
  await page.getByTestId("secret-name").fill("NEW_TOKEN");
  // The input is a password field, so it is not shoulder-read while pasting.
  await expect(page.getByTestId("secret-value")).toHaveAttribute(
    "type",
    "password",
  );
  await page.getByTestId("secret-value").fill("super-secret-value");
  await page.getByTestId("save-secret").click();

  const list = page.getByTestId("workspace-secrets");
  await expect(list).toContainText("NEW_TOKEN");
  // The value is gone from the page entirely — not masked, absent. A "••••••"
  // stand-in would imply there is something here to reveal.
  await expect(page.locator("body")).not.toContainText("super-secret-value");
  await leaveAndReturn(page, "secrets");
  await expect(page.locator("body")).not.toContainText("super-secret-value");
});

test("deleting a referenced secret says what will break", async ({ page }) => {
  await openSettings(page, "secrets");
  await page.getByTestId("delete-secret-sec-anthropic").click();
  await expect(page.getByTestId("delete-secret-dialog")).toContainText(
    "3 箇所から参照されています",
  );
});

test("personal connections are kept apart from workspace secrets", async ({
  page,
}) => {
  // A personal token stops working when its owner leaves and a workspace one
  // does not; one list is how a workflow ends up depending on an individual.
  await openSettings(page, "secrets");
  await expect(page.getByTestId("personal-secrets")).toContainText(
    "MY_DRIVE_TOKEN",
  );
  await expect(page.getByTestId("workspace-secrets")).not.toContainText(
    "MY_DRIVE_TOKEN",
  );
});

test("a self-hosted deployment sends nothing until it is asked to", async ({
  page,
}) => {
  await openSettings(page, "privacy");
  await page.getByTestId("edition-community").click();
  // Every category is a switch, and none of them is required.
  await expect(page.getByTestId("telemetry-toggle-operational")).toBeVisible();
  await expect(page.getByTestId("telemetry-required-operational")).toHaveCount(
    0,
  );
  await expect(
    page.getByTestId("telemetry-toggle-operational"),
  ).not.toBeChecked();
});

test("the hosted service says required rather than showing a dead switch", async ({
  page,
}) => {
  await openSettings(page, "privacy");
  await page.getByTestId("edition-saas").click();
  await expect(page.getByTestId("telemetry-required-operational")).toHaveText(
    "必須",
  );
  // Product analytics stays separable and off.
  await expect(
    page.getByTestId("telemetry-toggle-product-analytics"),
  ).not.toBeChecked();
});

test("the four things never collected are named on the screen", async ({
  page,
}) => {
  await openSettings(page, "privacy");
  const list = page.getByTestId("never-collected");
  for (const item of [
    "メッセージ本文",
    "Files の内容",
    "Secrets",
    "Agent の入出力",
  ]) {
    await expect(list).toContainText(item);
  }
});

test("an undecided deadline is shown as undecided", async ({ page }) => {
  // The doc records this as open; showing it as settled is how a placeholder
  // becomes the answer by default.
  await openSettings(page, "privacy");
  await expect(page.getByTestId("staleness-provisional")).toContainText(
    "まだ決まっていません",
  );
  await expect(page.getByTestId("staleness-saas")).toContainText("1時間");
  await expect(page.getByTestId("staleness-community")).toContainText("7日");
});

test("only a revocation takes something out of search and execution", async ({
  page,
}) => {
  await openSettings(page, "privacy");
  await expect(page.getByTestId("revocation-revoked")).toContainText(
    "実行の対象から外れます",
  );
  await expect(page.getByTestId("revocation-deprecated")).toContainText(
    "使えます",
  );
});

test("renaming the workspace says what happens to the old address", async ({
  page,
}) => {
  // "Will the link I sent last week still work" is the question a rename
  // actually raises, so it is answered before it is asked.
  await openSettings(page, "workspace");
  await expect(page.getByTestId("workspace-host")).toHaveText("acme.nuxx.ai");
  // Both halves of the promise: the old address keeps working, and the freed
  // name is not handed to a different organisation in the meantime.
  await expect(page.getByText(/90\s*日間こちらへつながります/)).toBeVisible();
  await expect(
    page.getByText(/他の Workspace\s*に割り当てられることはありません/),
  ).toBeVisible();

  await page.getByTestId("edit-workspace-slug").click();
  await page.getByTestId("workspace-slug-input").fill("acme-jp");
  await page.getByTestId("save-workspace-slug").click();
  await expect(page.getByTestId("workspace-host")).toHaveText(
    "acme-jp.nuxx.ai",
  );
});

test("an address that could not be a subdomain is refused with a reason", async ({
  page,
}) => {
  await openSettings(page, "workspace");
  await page.getByTestId("edit-workspace-slug").click();

  await page.getByTestId("workspace-slug-input").fill("My Team");
  await expect(page.getByTestId("workspace-slug-problem")).toContainText(
    "英小文字",
  );
  await expect(page.getByTestId("save-workspace-slug")).toBeDisabled();

  // A hostname the platform already answers at cannot be taken either.
  await page.getByTestId("workspace-slug-input").fill("app");
  await expect(page.getByTestId("workspace-slug-problem")).toContainText(
    "システム",
  );
  await expect(page.getByTestId("save-workspace-slug")).toBeDisabled();

  await page.getByTestId("workspace-slug-input").fill("acme-jp");
  await expect(page.getByTestId("workspace-slug-problem")).toHaveCount(0);
  await expect(page.getByTestId("save-workspace-slug")).toBeEnabled();
});

test("the session lifetimes are shown, and none of them is settable", async ({
  page,
}) => {
  // A workspace that could extend its own absolute ceiling could opt out of it.
  await openSettings(page, "workspace");
  const card = page.getByTestId("session-lifetimes");
  await expect(card.getByTestId("session-access")).toContainText("15分");
  await expect(card.getByTestId("session-refresh")).toContainText("12時間");
  await expect(card.getByTestId("session-absolute")).toContainText("7日");
  await expect(card.locator("button")).toHaveCount(0);
});

test("content with no expiry offers no control to change it", async ({
  page,
}) => {
  // A greyed-out dropdown invites someone to go looking for the permission to
  // use it, and there is none to find — so those rows have no control at all.
  await openSettings(page, "data");
  const table = page.getByTestId("retention-table");
  await expect(table.getByTestId("retention-fixed-content")).toContainText(
    "Workspace 存続中",
  );
  await expect(table.getByTestId("retention-picker-content")).toHaveCount(0);
  // The clocked rows do have one.
  await expect(
    table.getByTestId("retention-picker-execution-logs"),
  ).toBeVisible();
});

test("the backup window is stated, and is longer than the trash", async ({
  page,
}) => {
  // Someone told "deleted" who later finds it in a restore has been misled.
  await openSettings(page, "data");
  await expect(page.getByTestId("retention-fixed-backup")).toContainText(
    "35日",
  );
  await expect(page.getByTestId("retention-trash")).toContainText("30日");
});

test("a changed retention says what the default was", async ({ page }) => {
  await openSettings(page, "data");
  const row = page.getByTestId("retention-execution-logs");
  // The fixture moves this one off its default, so the comparison is shown.
  await expect(row).toContainText("既定 90日");

  await page.getByTestId("retention-picker-execution-logs").click();
  await page
    .getByTestId(`retention-picker-execution-logs-${180 * 24 * 3600}`)
    .click();
  await leaveAndReturn(page, "data");
  await expect(row).toContainText("180日");
});

test("Community Edition promises no recovery time rather than inventing one", async ({
  page,
}) => {
  await openSettings(page, "data");
  await expect(page.getByTestId("recovery-community")).toContainText(
    "構成によります",
  );
  await expect(page.getByTestId("recovery-saas")).toContainText("15分以内");
});

test("the region is shown as settled, not as a dropdown", async ({ page }) => {
  // Moving it is a migration, not a setting; a dropdown would imply otherwise.
  await openSettings(page, "data");
  const row = page.getByTestId("data-region-row");
  await expect(row).toContainText("Asia Pacific");
  await expect(row.locator("button")).toHaveCount(0);
});

/** Asserts `first` appears before `second` in a list of rendered rows. */
function assertOrder(rows: string[], first: string, second: string) {
  const firstAt = rows.findIndex((row) => row.includes(first));
  const secondAt = rows.findIndex((row) => row.includes(second));
  expect(firstAt).toBeGreaterThanOrEqual(0);
  expect(secondAt).toBeGreaterThan(firstAt);
}

// --- The rebuilt settings screens ------------------------------------------

test("a theme is picked from a grid of what it looks like", async ({
  page,
}) => {
  // The picker was a `<select>` of 62 file names, which asks the reader to choose a
  // file when what they are choosing is a look — and made them apply each one to
  // find out what it was.
  await page.goto("/settings/appearance");
  const grid = page.getByTestId("theme-grid");
  await expect(grid).toBeVisible();
  // Families, not halves: light and dark used to be separate entries, so the mode
  // control and the theme control fought each other.
  await expect(grid.getByTestId(/^theme-card-/)).toHaveCount(44);
  await expect(page.getByTestId("theme-card-nuxx")).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await page.getByTestId("theme-card-gruvbox-light-hard").click();
  await expect(
    page.getByTestId("theme-card-gruvbox-light-hard"),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("theme-card-nuxx")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});

test("each thumbnail is painted in its own theme, not in a placeholder", async ({
  page,
}) => {
  // Each card loads its own palette behind an IntersectionObserver. When the ref
  // that observer watches never reaches an element, every card keeps its
  // placeholder — a grid of identical grey windows, with nothing on the page
  // looking broken and no error anywhere. Three cards, three colours.
  await page.goto("/settings/appearance");
  const surfaces = ["nuxx", "gruvbox-light-hard", "solarized-light"].map(
    (family) => page.getByTestId(`theme-card-${family}`).locator("div").first(),
  );
  await expect
    .poll(async () => {
      const colors = await Promise.all(
        surfaces.map((surface) =>
          surface.evaluate((node) => getComputedStyle(node).backgroundColor),
        ),
      );
      return new Set(colors).size;
    })
    .toBe(3);
});

test("switching to Dark stays inside the chosen family", async ({ page }) => {
  await page.goto("/settings/appearance");
  await page.getByTestId("theme-card-github-light").click();
  await page.getByTestId("theme-dark").click();
  // Still Github — the mode picks the half, not a different row of a flat list.
  await expect(page.getByTestId("theme-card-github-light")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator("html")).toHaveClass(/dark/);
});

test("the thread layout setting actually moves the thread", async ({
  page,
}) => {
  // A stored string nothing reads is the mistake this codebase already made with
  // the theme tokens, so the setting has a consumer.
  await page.goto("/settings/appearance");
  await page.getByTestId("thread-layout").click();
  await page.getByTestId("thread-layout-full").click();

  await page.goto(`/c/${CH_DEV}`);
  const row = page
    .getByRole("listitem")
    .filter({ has: page.getByTestId("reply-in-thread") })
    .first();
  await row.hover();
  await row.getByTestId("reply-in-thread").click();

  // `full` hands the pane over to the thread rather than splitting it. The header
  // and the composer stay — the composer is what sends into the thread.
  await expect(page.getByTestId("thread-panel")).toBeVisible();
  await expect(page.getByTestId("message-timeline")).toHaveCount(0);
  await expect(page.getByTestId("open-emoji-picker")).toBeVisible();
});

test("each notification category picks its own sound, and previews it", async ({
  page,
}) => {
  // A DM and a thread reply that sound identical carry no more information than one
  // beep.
  await page.goto("/settings/notifications");
  await page.getByTestId("sound-dm").click();
  await page.getByTestId("sound-dm-knock").click();
  await expect(page.getByTestId("sound-dm")).toContainText("knock");
  await expect(page.getByTestId("sound-mention")).toContainText("flutter");
  await expect(page.getByTestId("preview-dm")).toBeVisible();

  // Per browser, so it survives leaving the screen.
  await page.getByTestId("settings-nav-voice").click();
  await page.getByTestId("settings-nav-notifications").click();
  await expect(page.getByTestId("sound-dm")).toContainText("knock");
});

test("turning off an experiment takes its section out of the app", async ({
  page,
}) => {
  // Real flags with real consumers: a list of switches that changed nothing would
  // be the same mistake as a token nothing reads.
  await page.goto("/settings/experiments");
  await expect(page.getByTestId("experiment-projects")).toBeVisible();
  await page.getByTestId("experiment-projects").click();

  await page.getByTestId("settings-back").click();
  await expect(page.getByTestId("nav-projects")).toHaveCount(0);
  // And the others are untouched.
  await expect(page.getByTestId("nav-pulse")).toBeVisible();
});

test("the profile screen reads before it edits, and says what is unset", async ({
  page,
}) => {
  // A profile is read far more often than it is changed, and a screen of input
  // boxes makes the reader parse a form to answer "what does everyone see".
  await page.goto("/settings/profile");
  const info = page.getByTestId("profile-info");
  await expect(info).toContainText("Not set");
  await expect(page.getByTestId("settings-display-name")).toHaveCount(0);

  await page.getByTestId("edit-profile").click();
  await expect(page.getByTestId("settings-display-name")).toBeVisible();
});

test("shortcuts are listed with the scope that makes them work", async ({
  page,
}) => {
  // A shortcut that "does not work" is almost always one pressed somewhere it does
  // not apply, which is what the second line is for.
  await page.goto("/settings/shortcuts");
  const writing = page.getByTestId("shortcuts-書く");
  await expect(writing).toContainText("送信する");
  await expect(writing).toContainText("メッセージ入力欄");
  // No rebinding controls, because the handlers are local to their screens — and the
  // panel says so rather than offering something that cannot work.
  await expect(
    page.getByText("割り当ての変更に対応していません"),
  ).toBeVisible();
});

test("the hosted screen lists only the communities it can manage", async ({
  page,
}) => {
  await page.goto("/settings/hosted");
  const list = page.getByTestId("hosted-list");
  await expect(list).toBeVisible();
  // A community reached by typing a relay URL has nothing here to manage — its
  // settings live on that relay — so listing it would imply otherwise.
  await expect(list.getByTestId(/^hosted-/)).toHaveCount(1);
  await expect(list).toContainText("design.nuxx.host");
});

test("the compute screen ranks models against a budget it can explain", async ({
  page,
}) => {
  // A browser cannot read the machine's AI memory — there is no GPU-memory API and
  // `deviceMemory` is rounded, capped and Chromium-only — so the budget is the
  // reader's own cap and the screen says so rather than guessing.
  await page.goto("/settings/compute");
  const suggestions = page.getByTestId("model-suggestions");
  await expect(suggestions).toBeVisible();
  // Best fit first: the largest model that still fits leads.
  await expect(suggestions.getByRole("listitem").first()).toContainText(
    "qwen3-coder:30b",
  );

  await page.getByTestId("show-all-models").click();
  // A model that does not fit stays on the list — the reader's next question is
  // whether a smaller quantization exists, and dropping it says it does not exist.
  await expect(suggestions).toContainText("llama3.3:70b");
  await expect(suggestions).toContainText("入りません");
});

test("picking a suggested model sets the served one", async ({ page }) => {
  await page.goto("/settings/compute");
  // Third in the ranking, so it is behind the "show the rest" link.
  await page.getByTestId("show-all-models").click();
  await page.getByTestId("model-llama3.2:3b").click();
  await expect(page.getByTestId("mesh-model")).toHaveValue("llama3.2:3b");
  // Per the fixtures, so it survives leaving the screen.
  await page.getByTestId("settings-nav-agents").click();
  await page.getByTestId("settings-nav-compute").click();
  await expect(page.getByTestId("mesh-model")).toHaveValue("llama3.2:3b");
});

test("a runtime that needs a CLI says so, and links to its guide", async ({
  page,
}) => {
  // Not-installed entries stay on the list: the reader's next question is how to
  // get one, and hiding it turns "not installed" into "does not exist".
  await page.goto("/settings/agents");
  const missing = page.getByTestId("harness-gemini-cli");
  await expect(missing).toContainText("CLI needed");
  await expect(missing.getByText("CLI setup guide")).toBeVisible();
  await expect(page.getByTestId("harness-claude-code")).toContainText("Ready");
});

test("the hosted screen carries no other company's sign-in", async ({
  page,
}) => {
  // The desktop client this was ported from was Block's, and its hosted screen
  // signed in with Builderlab. Reproducing that would have been faithful to a
  // screenshot and wrong about the product — a Nuxx workspace signs in at its
  // own account host, which the Workspace screen describes.
  await page.goto("/settings/hosted");
  await expect(page.locator("body")).not.toContainText("Builderlab");
  await expect(page.locator("body")).not.toContainText("Block");
  await expect(page.getByTestId("hosted-signin-button")).toHaveCount(0);
  // What the screen is actually for is still reachable.
  await expect(page.getByTestId("create-hosted")).toBeEnabled();
});

test("the update check reports the build it is actually running", async ({
  page,
}) => {
  // A web client has no download to apply, but "this tab is running last week's
  // bundle" is a real thing to be told — and it is answerable from the entry
  // script's content hash.
  await page.goto("/settings/updates");
  await expect(page.getByTestId("update-status-row")).toContainText(
    "最新版です",
  );
  await expect(page.getByTestId("app-version")).toBeVisible();

  // A different build deployed under the same URL is reported as an update.
  await page.route("**/index.html", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: `<!doctype html><script type="module" src="/assets/index-DIFFERENT.js"></script>`,
    });
  });
  await page.getByTestId("check-for-updates").click();
  await expect(page.getByTestId("update-now")).toBeVisible();
});
