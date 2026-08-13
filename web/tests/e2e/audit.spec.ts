import { expect, test } from "@playwright/test";

/**
 * Screenshots of every main surface, for looking at.
 *
 * Not assertions — a visual sweep. The suite proves behaviour; this is for
 * catching the things behaviour tests cannot see: a panel that overflows, a
 * heading that wraps badly, an empty state that reads as a bug.
 */

const CH_DEV = "22222222-2222-4222-8222-222222222222";
const CH_INCIDENT = "77777777-7777-4777-8777-777777777777";

const SURFACES: [name: string, path: string][] = [
  ["01-channel", `/c/${CH_DEV}`],
  ["02-inbox", "/home"],
  ["03-agents", "/agents"],
  ["04-projects", "/projects"],
  ["05-workflows", "/workflows"],
  ["06-pulse", "/pulse"],
  ["07-forum", "/forum"],
  ["08-reminders", "/reminders"],
  ["09-files", "/files"],
  ["10-browse", "/browse"],
];

for (const [name, path] of SURFACES) {
  test(`audit ${name}`, async ({ page }) => {
    await page.goto(path);
    await page.waitForTimeout(600);
    await page.screenshot({ path: `test-results/audit/${name}.png` });
    // The one thing worth asserting: nothing threw on the way in.
    await expect(page.locator("body")).not.toContainText("Unexpected error");
  });
}

const PANELS = [
  "profile",
  "appearance",
  "notifications",
  "workspace",
  "security",
  "secrets",
  "data",
  "privacy",
  "templates",
  "agents",
  "compute",
  "archive",
  "mobile",
];

for (const panel of PANELS) {
  test(`audit settings/${panel}`, async ({ page }) => {
    await page.goto(`/settings/${panel}`);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `test-results/audit/settings-${panel}.png` });
    await expect(page.locator("body")).not.toContainText("Unexpected error");
  });
}

test("audit canvas panel", async ({ page }) => {
  await page.goto(`/c/${CH_INCIDENT}`);
  await page.getByTestId("toggle-canvas").click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: "test-results/audit/11-canvas.png" });
});

test("audit publish dialog", async ({ page }) => {
  await page.goto(`/c/${CH_INCIDENT}`);
  await page.getByTestId("open-publish-channel").click();
  await page.getByTestId("publish-to-findings").click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: "test-results/audit/12-publish-findings.png" });
});

test("audit agent detail with evaluation", async ({ page }) => {
  await page.goto("/agents");
  await page.getByTestId("agent-select-レビュー係").click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: "test-results/audit/13-agent-evaluation.png" });
});
