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
  await page.goto("/settings");
  await page.getByTestId("settings-nav-community").click();
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
  await page.goto("/settings");
  await page.getByTestId("settings-nav-community").click();

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
