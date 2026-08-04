import { defineConfig, devices } from "@playwright/test";

// Opt-in escape hatch for sandboxes that ship a pinned Chromium whose revision
// does not match this Playwright version's expected download. Unset in CI, so
// the normal managed-browser path is unaffected.
const executablePath = process.env.NUXX_PLAYWRIGHT_CHROMIUM;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
  ],
  use: {
    baseURL: "http://127.0.0.1:4173",
    screenshot: "only-on-failure",
    trace: "on-first-retry",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "smoke",
      testMatch: ["**/smoke.spec.ts"],
      use: {
        ...devices["Desktop Chrome"],
        ...(executablePath ? { launchOptions: { executablePath } } : {}),
      },
    },
    {
      // The mock-up screens (Workflows, Agents, Projects, Forum, Reminders,
      // members, huddle, Pulse) only have data behind them when the bundle is
      // built with VITE_MOCK_RELAY=1 — outside that build their fixtures are
      // deliberately null, so the smoke project cannot reach them at all. Hence
      // a second bundle and a second preview server rather than a flag.
      name: "showcase",
      testMatch: ["**/showcase.spec.ts"],
      use: {
        ...devices["Desktop Chrome"],
        ...(executablePath ? { launchOptions: { executablePath } } : {}),
        baseURL: "http://127.0.0.1:4174",
      },
    },
  ],
  webServer: [
    {
      command:
        "pnpm exec vite preview --port 4173 --strictPort --host 127.0.0.1",
      cwd: ".",
      reuseExistingServer: !process.env.CI,
      url: "http://127.0.0.1:4173",
    },
    {
      command:
        "pnpm exec vite preview --outDir dist-mock --port 4174 --strictPort --host 127.0.0.1",
      cwd: ".",
      reuseExistingServer: !process.env.CI,
      url: "http://127.0.0.1:4174",
    },
  ],
});
