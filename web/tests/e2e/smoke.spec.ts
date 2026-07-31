import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";

test("home page loads with Buzz branding", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("main").getByRole("img", { name: "Buzz" }),
  ).toBeVisible();
});

test("home page shows repositories section", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Repositories")).toBeVisible();
});

test("invite requires age and legal consent before opening Buzz", async ({
  page,
}) => {
  await page.route("**/api/join-policy", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        policy: {
          terms_markdown: "# Terms",
          privacy_markdown: "# Privacy",
          age_attestation_required: true,
          version: "policy-v1",
        },
      }),
    });
  });
  await page.route("https://api.github.com/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify([
        { draft: false, prerelease: false, assets: [] },
        {
          draft: false,
          prerelease: false,
          assets: [
            {
              name: "Buzz_0.4.9_aarch64.dmg",
              browser_download_url:
                "https://github.com/tkrnkym/buzz/releases/download/v0.4.9/Buzz_0.4.9_aarch64.dmg",
            },
            {
              name: "Buzz_0.4.9_x64.dmg",
              browser_download_url:
                "https://github.com/tkrnkym/buzz/releases/download/v0.4.9/Buzz_0.4.9_x64.dmg",
            },
            {
              name: "Buzz_0.4.9_amd64.AppImage",
              browser_download_url:
                "https://github.com/tkrnkym/buzz/releases/download/v0.4.9/Buzz_0.4.9_amd64.AppImage",
            },
            {
              name: "Buzz_0.4.9_x64-setup_alpha-unsigned.exe",
              browser_download_url:
                "https://github.com/tkrnkym/buzz/releases/download/v0.4.9/Buzz_0.4.9_x64-setup_alpha-unsigned.exe",
            },
          ],
        },
      ]),
    });
  });
  await page.goto("/invite/demo-code");

  await expect(
    page.getByRole("link", { name: "Download it now" }),
  ).toHaveAttribute(
    "href",
    "https://github.com/tkrnkym/buzz/releases/download/v0.4.9/Buzz_0.4.9_x64-setup_alpha-unsigned.exe",
  );

  const ageConfirmation = page.getByLabel("I am 18 years of age or older.");
  const agreementConfirmation = page.getByLabel(
    "I agree to the Buzz Terms of Service and Privacy Policy.",
  );
  const acceptInvite = page.getByRole("button", {
    name: "Accept invite in Buzz",
  });

  await expect(ageConfirmation).toBeVisible();
  await expect(agreementConfirmation).toBeVisible();
  await expect(acceptInvite).toBeDisabled();

  const termsLink = page.getByRole("button", { name: "Terms of Service" });
  const privacyLink = page.getByRole("button", { name: "Privacy Policy" });
  await expect(termsLink).toHaveCSS("text-decoration-line", "none");
  await expect(privacyLink).toHaveCSS("text-decoration-line", "none");
  await termsLink.hover();
  await expect(termsLink).toHaveCSS("text-decoration-line", "underline");
  await page.mouse.move(0, 0);
  await privacyLink.hover();
  await expect(privacyLink).toHaveCSS("text-decoration-line", "underline");

  await page
    .locator("label")
    .filter({ hasText: "I am 18 years of age or older." })
    .click();
  await expect(ageConfirmation).toBeChecked();
  await expect(acceptInvite).toBeDisabled();
  await page
    .locator("label")
    .filter({
      hasText: "I agree to the Buzz Terms of Service and Privacy Policy.",
    })
    .click({ position: { x: 8, y: 8 } });
  await expect(agreementConfirmation).toBeChecked();
  await expect(acceptInvite).toBeEnabled();

  const consentBox = await page
    .getByTestId("invite-join-policy-notice")
    .boundingBox();
  const acceptButtonBox = await acceptInvite.boundingBox();
  expect(consentBox?.y).toBeLessThan(acceptButtonBox?.y ?? 0);
  expect(consentBox?.width).toBe(acceptButtonBox?.width);
});

test("invite can enroll a NIP-07 identity for browser access", async ({
  page,
}) => {
  const pubkey = "ab".repeat(32);
  await page.addInitScript((extensionPubkey) => {
    (
      window as Window & {
        nostr?: {
          getPublicKey(): Promise<string>;
          signEvent(
            event: Record<string, unknown>,
          ): Promise<Record<string, unknown>>;
        };
      }
    ).nostr = {
      async getPublicKey() {
        return extensionPubkey;
      },
      async signEvent(event) {
        return {
          ...event,
          id: "cd".repeat(32),
          pubkey: extensionPubkey,
          sig: "ef".repeat(64),
        };
      },
    };
  }, pubkey);
  await page.route("**/api/join-policy", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ policy: null }),
    });
  });

  let claimObserved = false;
  await page.route("**/api/invites/claim", async (route) => {
    claimObserved = true;
    const request = route.request();
    const body = request.postData() ?? "";
    expect(JSON.parse(body)).toEqual({
      code: "browser-code",
    });

    const authorization = request.headers().authorization;
    expect(authorization).toMatch(/^Nostr /);
    const event = JSON.parse(
      Buffer.from(authorization.slice("Nostr ".length), "base64").toString(
        "utf8",
      ),
    ) as {
      pubkey: string;
      tags: string[][];
    };
    expect(event.pubkey).toBe(pubkey);
    expect(event.tags).toContainEqual(["u", request.url()]);
    expect(event.tags).toContainEqual(["method", "POST"]);
    expect(event.tags).toContainEqual([
      "payload",
      createHash("sha256").update(body).digest("hex"),
    ]);

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "joined",
        community_id: "community-id",
        host: "127.0.0.1",
        role: "member",
      }),
    });
  });

  await page.goto("/invite/browser-code");
  await page.getByRole("button", { name: "Join in browser" }).click();
  await expect(page).toHaveURL("/");
  expect(claimObserved).toBe(true);
});

test("invite asks Safari users to choose their Mac download", async ({
  browser,
}) => {
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/26.5 Safari/605.1.15",
  });
  await context.addInitScript(() => {
    Object.defineProperties(navigator, {
      platform: { configurable: true, value: "MacIntel" },
      maxTouchPoints: { configurable: true, value: 0 },
      userAgentData: { configurable: true, value: undefined },
    });
  });
  const page = await context.newPage();
  await page.route("**/api/join-policy", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ policy: null }),
    });
  });
  await page.route("https://api.github.com/**", async (route) => {
    await route.fulfill({ status: 500 });
  });

  await page.goto("/invite/demo-code");
  const download = page.getByRole("link", { name: "Download it now" });
  await expect(download).toHaveAttribute("aria-haspopup", "dialog");
  await download.click();

  const chooser = page.getByRole("dialog", {
    name: "Which Mac do you have?",
  });
  await expect(chooser).toBeVisible();
  await expect(chooser.getByRole("link", { name: /Newer Mac/ })).toContainText(
    "2021 or later, or a late-2020 Mac with an Apple M1 chip",
  );
  await expect(chooser.getByRole("link", { name: /Older Mac/ })).toContainText(
    "2019 or earlier, or a 2020 Mac with an Intel processor",
  );
  await expect(chooser.getByText("About This Mac")).toBeVisible();

  const openedPagePromise = context.waitForEvent("page");
  await chooser.getByRole("link", { name: /Newer Mac/ }).click();
  const openedPage = await openedPagePromise;
  await expect(chooser).toBeHidden();
  await expect(openedPage).toHaveURL(
    "https://github.com/tkrnkym/buzz/releases",
  );
  await expect(page).toHaveURL(/\/invite\/demo-code$/);
  await openedPage.close();

  await download.click();
  await expect(chooser).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(chooser).toBeHidden();
  await expect(download).toBeFocused();
  await context.close();
});

test("invite download falls back for mobile and non-desktop devices", async ({
  browser,
}) => {
  const unsupportedDevices = [
    {
      name: "iPhone Safari",
      platform: "iPhone",
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15",
      maxTouchPoints: 5,
    },
    {
      name: "iPadOS desktop mode",
      platform: "MacIntel",
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15",
      maxTouchPoints: 5,
    },
    {
      name: "Android phone",
      platform: "Linux armv8l",
      userAgent:
        "Mozilla/5.0 (Linux; Android 15; Pixel 9 Pro) AppleWebKit/537.36 Mobile",
      maxTouchPoints: 5,
    },
    {
      name: "ChromeOS",
      platform: "Linux x86_64",
      userAgent: "Mozilla/5.0 (X11; CrOS x86_64 16093.68.0) AppleWebKit/537.36",
      maxTouchPoints: 0,
    },
  ];

  for (const device of unsupportedDevices) {
    const context = await browser.newContext({ userAgent: device.userAgent });
    await context.addInitScript(({ platform, maxTouchPoints }) => {
      Object.defineProperties(navigator, {
        platform: { configurable: true, value: platform },
        maxTouchPoints: { configurable: true, value: maxTouchPoints },
        userAgentData: {
          configurable: true,
          value: { platform, mobile: maxTouchPoints > 0 },
        },
      });
    }, device);
    const page = await context.newPage();
    await page.route("**/api/join-policy", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ policy: null }),
      });
    });
    await page.route("https://api.github.com/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify([
          {
            draft: false,
            prerelease: false,
            assets: [
              {
                name: "Buzz_0.4.9_x64.dmg",
                browser_download_url:
                  "https://github.com/tkrnkym/buzz/releases/download/v0.4.9/Buzz_0.4.9_x64.dmg",
              },
              {
                name: "Buzz_0.4.9_amd64.AppImage",
                browser_download_url:
                  "https://github.com/tkrnkym/buzz/releases/download/v0.4.9/Buzz_0.4.9_amd64.AppImage",
              },
            ],
          },
        ]),
      });
    });

    await page.goto("/invite/demo-code");
    await expect(
      page.getByRole("link", { name: "Download it now" }),
      device.name,
    ).toHaveAttribute("href", "https://github.com/tkrnkym/buzz/releases");
    await context.close();
  }
});

/**
 * Chat surface, driven against a mocked relay WebSocket.
 *
 * `page.routeWebSocket` handles the connection entirely in-process, so the spec
 * exercises the real NIP-42 handshake, REQ/EVENT/EOSE dispatch, and publish path
 * without a Postgres/Redis-backed relay.
 *
 * `POST /query` is mocked alongside it, because two reads deliberately do not go
 * over the socket. Neither kind is ever stored, so a subscription alone would
 * deliver nothing until the next write: presence is synthesized from Redis on
 * demand, and activity snapshots are synthesized for the initial badge picture.
 */
interface QueryFilter {
  kinds?: number[];
  authors?: string[];
  since?: number;
  limit?: number;
  before_id?: string;
  search?: string;
  page?: number;
  "#h"?: string[];
}

function mockRelay(
  page: import("@playwright/test").Page,
  options: {
    extraMessages?: unknown[];
    auxEvents?: unknown[];
    /**
     * Channel id -> last-activity unix seconds, served as kind:39007 activity
     * snapshots. Delivered both to the initial `POST /query` and live over the
     * subscription, which is how the relay serves them.
     */
    channelActivity?: Record<string, number>;
    /** Served to the kind:20001 presence read over `POST /query`. */
    presenceEvents?: unknown[];
    /** Extra kind:39000 metadata, for rooms beyond the default one. */
    extraChannels?: unknown[];
    /** Served to the kind:30078 read-state read. */
    readStateEvents?: unknown[];
    /** Served to the kind:20002 typing subscription. */
    typingEvents?: unknown[];
    /** Served to a `POST /query` carrying a scrollback cursor. */
    olderMessages?: unknown[];
    /** Served to a NIP-50 search, by page number (1-based). */
    searchPages?: Record<number, unknown[]>;
    /**
     * Hold back the OK for a read-state write, so a spec can advance a second
     * cursor while the first publish is still in flight.
     */
    delayReadStateOkMs?: number;
  } = {},
) {
  const published: unknown[][] = [];
  /** Every REQ filter the client opened, so a spec can assert what it did not. */
  const subscriptions: QueryFilter[] = [];
  /** Every `POST /query` body, as an array of filters per request. */
  const queries: QueryFilter[][] = [];
  /** Cursors the client paged with, in order. */
  const historyRequests: { until: number; beforeId: string }[] = [];
  /** Search filters the client sent, in order. */
  const searchRequests: QueryFilter[] = [];

  const channelMetadata = {
    id: "a".repeat(64),
    pubkey: "b".repeat(64),
    kind: 39000,
    created_at: 1_700_000_000,
    tags: [
      ["d", "11111111-1111-1111-1111-111111111111"],
      ["name", "general"],
      ["about", "Everything else"],
      ["public"],
      ["closed"],
      ["t", "stream"],
      ["topic", "ship it"],
    ],
    content: "",
    sig: "c".repeat(128),
  };

  const message = {
    id: "d".repeat(64),
    pubkey: "e".repeat(64),
    kind: 9,
    created_at: 1_700_000_100,
    tags: [["h", "11111111-1111-1111-1111-111111111111"]],
    content: "hello from the mocked relay",
    sig: "f".repeat(128),
  };

  /**
   * Build the kind:39007 snapshots for the seeded activity.
   *
   * Sharded the way the relay shards, so a spec that seeds two channels
   * exercises the merge across shards rather than a single event — replacing
   * instead of merging would pass a one-shard test and lose badges in real use.
   */
  const activitySnapshots = () => {
    const byShard = new Map<number, Record<string, number>>();
    for (const [channelId, at] of Object.entries(
      options.channelActivity ?? {},
    )) {
      // Same rule as `shard_of` in nuxx-core: the UUID's last bytes, mod the
      // shard count.
      const shard =
        Number.parseInt(channelId.replace(/-/g, "").slice(-8), 16) % 16;
      byShard.set(shard, { ...(byShard.get(shard) ?? {}), [channelId]: at });
    }
    return [...byShard].map(([shard, channels]) => ({
      id: `39007${shard}`.padEnd(64, "0"),
      pubkey: "b".repeat(64),
      kind: 39007,
      created_at: 1_900_000_000,
      tags: [["d", `activity:${shard}`]],
      content: JSON.stringify({ shard, channels }),
      sig: "f".repeat(128),
    }));
  };

  return {
    published,
    subscriptions,
    queries,
    historyRequests,
    searchRequests,
    install: async () => {
      await page.route("**/query", async (route) => {
        const body = JSON.parse(route.request().postData() ?? "{}") as {
          filters?: QueryFilter[];
        };
        const filters = body.filters ?? [];
        queries.push(filters);

        const events: unknown[] = [];
        for (const filter of filters) {
          if (filter.kinds?.includes(20001)) {
            events.push(...(options.presenceEvents ?? []));
          } else if (filter.kinds?.includes(39007)) {
            events.push(...activitySnapshots());
          } else if (filter.search) {
            searchRequests.push(filter);
            // The relay's p-gate rejects a search that names no kinds, so the
            // mock does too — a client that stopped sending them would pass
            // here and 403 in production.
            if (!filter.kinds || filter.kinds.length === 0) {
              await route.fulfill({
                status: 403,
                body: "restricted: kinds required",
              });
              return;
            }
            events.push(...(options.searchPages?.[filter.page ?? 1] ?? []));
          } else if (filter.before_id) {
            // A scrollback page. The relay requires `until` alongside
            // `before_id` and rejects one without the other, so the mock does
            // too — a client that sent a half cursor would pass otherwise.
            if (filter.until === undefined) {
              await route.fulfill({
                status: 400,
                body: "before_id requires until",
              });
              return;
            }
            historyRequests.push({
              until: filter.until,
              beforeId: filter.before_id,
            });
            events.push(...(options.olderMessages ?? []));
          }
        }

        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(events),
        });
      });

      await page.routeWebSocket(
        (url) => url.protocol === "ws:" || url.protocol === "wss:",
        (ws) => {
          // Buzz relays always challenge before serving anything.
          ws.send(JSON.stringify(["AUTH", "challenge-from-mock"]));

          ws.onMessage((raw) => {
            const frame = JSON.parse(String(raw));
            const [verb] = frame;

            if (verb === "AUTH") {
              ws.send(JSON.stringify(["OK", frame[1].id, true, ""]));
              return;
            }

            if (verb === "EVENT") {
              published.push(frame[1]);
              const delay =
                frame[1].kind === 30078 ? (options.delayReadStateOkMs ?? 0) : 0;
              if (delay > 0) {
                setTimeout(
                  () => ws.send(JSON.stringify(["OK", frame[1].id, true, ""])),
                  delay,
                );
                return;
              }
              ws.send(JSON.stringify(["OK", frame[1].id, true, ""]));
              // Echo it back on the live subscription, as a relay would.
              ws.send(JSON.stringify(["EVENT", "s1", frame[1]]));
              return;
            }

            if (verb === "REQ") {
              const [, subId, filter] = frame;
              subscriptions.push(filter);
              if (filter.kinds.includes(39000)) {
                ws.send(JSON.stringify(["EVENT", subId, channelMetadata]));
                for (const extra of options.extraChannels ?? []) {
                  ws.send(JSON.stringify(["EVENT", subId, extra]));
                }
              } else if (filter.kinds.includes(30078)) {
                for (const readState of options.readStateEvents ?? []) {
                  ws.send(JSON.stringify(["EVENT", subId, readState]));
                }
              } else if (filter.kinds.includes(9) && filter["#h"]) {
                // Echo the requested channel back on the `h` tag so a spec that
                // opens two rooms sees each one's own timeline.
                ws.send(
                  JSON.stringify([
                    "EVENT",
                    subId,
                    {
                      ...message,
                      // Real event ids are 64 hex chars; the channel UUID's
                      // dashes would make this an id no relay could emit, and a
                      // spec asserting on cursor shape would fail on the
                      // fixture rather than on the client.
                      id: `${filter["#h"][0]}`
                        .replace(/-/g, "")
                        .padEnd(64, "0")
                        .slice(0, 64),
                      tags: [["h", filter["#h"][0]]],
                    },
                  ]),
                );
                for (const extra of options.extraMessages ?? []) {
                  ws.send(JSON.stringify(["EVENT", subId, extra]));
                }
              } else if (filter.kinds.includes(39007)) {
                // Live badge updates. The relay never stores these, so a real
                // subscription only carries what happens after it opens — the
                // initial picture comes from `POST /query`. The mock replays the
                // seeded state here anyway, so a spec that breaks the query path
                // cannot be rescued by the socket without the query assertions
                // noticing.
                for (const snapshot of activitySnapshots()) {
                  ws.send(JSON.stringify(["EVENT", subId, snapshot]));
                }
              } else if (filter.kinds.includes(20002)) {
                for (const typing of options.typingEvents ?? []) {
                  ws.send(JSON.stringify(["EVENT", subId, typing]));
                }
              } else if (filter.kinds.includes(7)) {
                // The #e-keyed auxiliary read: reactions and NIP-09 deletes,
                // neither of which carries an `h` tag.
                for (const aux of options.auxEvents ?? []) {
                  ws.send(JSON.stringify(["EVENT", subId, aux]));
                }
              }
              ws.send(JSON.stringify(["EOSE", subId]));
            }
          });
        },
      );
    },
  };
}

test("chat lists channels from kind:39000 metadata", async ({ page }) => {
  const relay = mockRelay(page);
  await relay.install();

  await page.goto("/c");

  await expect(
    page.getByRole("navigation", { name: "Channels" }).getByText("general"),
  ).toBeVisible();
  // No NIP-07 extension in a plain browser, so custody must be shown as
  // disposable rather than silently assumed durable.
  await expect(page.getByText("temporary identity")).toBeVisible();
  await expect(page.getByText("Connected")).toBeVisible();
});

test("opening a channel renders its timeline", async ({ page }) => {
  const relay = mockRelay(page);
  await relay.install();

  await page.goto("/c");
  await page
    .getByRole("navigation", { name: "Channels" })
    .getByText("general")
    .click();

  await expect(page.getByRole("heading", { name: "#general" })).toBeVisible();
  await expect(page.getByText("ship it")).toBeVisible();
  await expect(page.getByText("hello from the mocked relay")).toBeVisible();
});

test("sending a message publishes kind:9 with the channel h tag", async ({
  page,
}) => {
  const relay = mockRelay(page);
  await relay.install();

  await page.goto("/c/11111111-1111-1111-1111-111111111111");

  const composer = page.getByRole("textbox", { name: "Message #general" });
  await composer.fill("sent from the browser");
  await page.getByRole("button", { name: "Send" }).click();

  // The composer clears only after the relay OKs the event.
  await expect(composer).toHaveValue("");
  await expect(page.getByText("sent from the browser")).toBeVisible();

  // Read state publishes on the same stream, so scope to the message kind.
  const messages = relay.published.filter(
    (published) => (published as { kind: number }).kind === 9,
  );
  expect(messages).toHaveLength(1);
  const event = messages[0] as {
    kind: number;
    tags: string[][];
    content: string;
  };
  expect(event.kind).toBe(9);
  expect(event.tags).toContainEqual([
    "h",
    "11111111-1111-1111-1111-111111111111",
  ]);
  expect(event.content).toBe("sent from the browser");
});

const CHANNEL_UUID = "11111111-1111-1111-1111-111111111111";

function markdownMessage(id: string, content: string, tags: string[][] = []) {
  return {
    id: id.repeat(64).slice(0, 64),
    pubkey: "e".repeat(64),
    kind: 9,
    created_at: 1_700_000_200,
    tags: [["h", CHANNEL_UUID], ...tags],
    content,
    sig: "f".repeat(128),
  };
}

test("message content renders markdown", async ({ page }) => {
  const relay = mockRelay(page, {
    extraMessages: [
      markdownMessage(
        "1",
        "**bold** and `inline code`\n\n```\nconst x = 1;\n```\n\n- first\n- second",
      ),
    ],
  });
  await relay.install();

  await page.goto(`/c/${CHANNEL_UUID}`);

  await expect(page.getByText("bold", { exact: true })).toHaveJSProperty(
    "tagName",
    "STRONG",
  );
  await expect(page.getByText("inline code")).toBeVisible();
  await expect(page.locator("pre code")).toContainText("const x = 1;");
  // Anchored: a timeline row is itself an <li>, so a substring match would also
  // hit the row wrapping this markdown list.
  await expect(
    page.getByRole("listitem").filter({ hasText: /^first$/ }),
  ).toBeVisible();
});

test("external links open safely and unsafe schemes are not clickable", async ({
  page,
}) => {
  const relay = mockRelay(page, {
    extraMessages: [
      markdownMessage(
        "2",
        "[docs](https://example.com/docs) and [do not click](javascript:alert(1))",
      ),
    ],
  });
  await relay.install();

  await page.goto(`/c/${CHANNEL_UUID}`);

  const external = page.getByRole("link", { name: "docs" });
  await expect(external).toHaveAttribute("target", "_blank");
  // `noopener` denies the opened page window.opener; `noreferrer` withholds the
  // relay host from its Referer.
  await expect(external).toHaveAttribute("rel", "noopener noreferrer");

  // A javascript: URL must never become an activatable anchor.
  await expect(page.getByText("do not click")).toBeVisible();
  await expect(page.getByRole("link", { name: "do not click" })).toHaveCount(0);
});

test("a buzz://message autolink becomes in-app navigation", async ({
  page,
}) => {
  const target = "a".repeat(64);
  const relay = mockRelay(page, {
    extraMessages: [
      markdownMessage(
        "3",
        `see <buzz://message?channel=${CHANNEL_UUID}&id=${target}>`,
      ),
    ],
  });
  await relay.install();

  await page.goto(`/c/${CHANNEL_UUID}`);

  // An autolink has no author-written label, so it renders as a compact pill
  // rather than the raw URL.
  const pill = page.getByRole("link", { name: "message" });
  await expect(pill).toHaveAttribute("href", `/c/${CHANNEL_UUID}?m=${target}`);
});

test("an image is sized from its NIP-92 imeta dim before it loads", async ({
  page,
}) => {
  const url = "https://media.example.invalid/shot.png";
  const relay = mockRelay(page, {
    extraMessages: [
      markdownMessage("4", `![shot](${url})`, [
        ["imeta", `url ${url}`, "m image/png", "dim 800x600"],
      ]),
    ],
  });
  await relay.install();

  await page.goto(`/c/${CHANNEL_UUID}`);

  // Explicit intrinsic dimensions let the browser reserve aspect-correct space,
  // so a late decode cannot shove the timeline down.
  const image = page.locator('img[alt="shot"]');
  await expect(image).toHaveAttribute("width", "800");
  await expect(image).toHaveAttribute("height", "600");
});

test("reactions render from #e-keyed events and toggle", async ({ page }) => {
  const target = markdownMessage("7", "react to me");
  const relay = mockRelay(page, {
    extraMessages: [target],
    auxEvents: [
      {
        id: "aa".repeat(32),
        pubkey: "cc".repeat(32),
        kind: 7,
        created_at: 1_700_000_300,
        // A reaction carries only an `e` tag — no `h` — so it is only reachable
        // through the #e subscription.
        tags: [["e", target.id]],
        content: "🎉",
        sig: "f".repeat(128),
      },
    ],
  });
  await relay.install();

  await page.goto(`/c/${CHANNEL_UUID}`);

  const pill = page.getByRole("button", { name: "🎉 1" });
  await expect(pill).toBeVisible();
  // Not the reader's own reaction, so it is not shown as pressed.
  await expect(pill).toHaveAttribute("aria-pressed", "false");

  await pill.click();
  await expect(page.getByRole("button", { name: "🎉 2" })).toBeVisible();

  const reaction = relay.published.find(
    (event) => (event as { kind: number }).kind === 7,
  ) as { kind: number; tags: string[][]; content: string };
  expect(reaction.content).toBe("🎉");
  expect(reaction.tags).toEqual([["e", target.id]]);
});

test("a quick reaction publishes kind:7 against the message", async ({
  page,
}) => {
  const target = markdownMessage("8", "quick react");
  const relay = mockRelay(page, { extraMessages: [target] });
  await relay.install();

  await page.goto(`/c/${CHANNEL_UUID}`);

  await page.getByRole("button", { name: "React with 👍" }).first().click();
  await expect(page.getByRole("button", { name: "👍 1" })).toBeVisible();
  // The reader's own reaction reads as pressed, so a second click withdraws it.
  await expect(page.getByRole("button", { name: "👍 1" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("replying publishes thread tags and shows the reply count", async ({
  page,
}) => {
  const root = markdownMessage("9", "the original");
  const relay = mockRelay(page, { extraMessages: [root] });
  await relay.install();

  await page.goto(`/c/${CHANNEL_UUID}`);

  // Scope to the intended row: the mock also serves a baseline message, and a
  // bare `.first()` would reply to that instead.
  const rootRow = page
    .getByRole("listitem")
    .filter({ hasText: "the original" });
  await rootRow.getByRole("button", { name: "Reply" }).click();
  await expect(page.getByText(/Replying to/)).toBeVisible();

  const composer = page.getByRole("textbox", { name: /^Reply to/ });
  await composer.fill("a threaded answer");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(rootRow.getByText("1 reply")).toBeVisible();

  // Scoped to kind 9: a typing announcement carries the same thread tags, so a
  // tag-only match would find the indicator instead of the message.
  const reply = relay.published.find(
    (event) =>
      (event as { kind: number }).kind === 9 &&
      (event as { tags: string[][] }).tags.some((tag) => tag[3] === "reply"),
  ) as { kind: number; tags: string[][] };
  expect(reply.kind).toBe(9);
  // Root === parent for a direct reply, which nuxx-sdk collapses to one tag.
  expect(reply.tags).toContainEqual(["e", root.id, "", "reply"]);
  expect(reply.tags).toContainEqual(["h", CHANNEL_UUID]);
});

test("a deleted message renders as a tombstone", async ({ page }) => {
  const target = markdownMessage("a", "will be removed");
  const relay = mockRelay(page, {
    extraMessages: [
      target,
      {
        id: "bb".repeat(32),
        pubkey: "e".repeat(64),
        kind: 9005,
        created_at: 1_700_000_400,
        tags: [
          ["h", CHANNEL_UUID],
          ["e", target.id],
          ["public_reason", "Removed as spam"],
        ],
        content: "",
        sig: "f".repeat(128),
      },
    ],
  });
  await relay.install();

  await page.goto(`/c/${CHANNEL_UUID}`);

  // The row survives as a tombstone so a reader following a reply can see the
  // parent existed and was removed.
  await expect(
    page.getByText("Message deleted — Removed as spam"),
  ).toBeVisible();
  await expect(page.getByText("will be removed")).toHaveCount(0);
});

/**
 * Install a NIP-07 extension stub that also implements NIP-44.
 *
 * The reversible transform stands in for real encryption: the point under test
 * is that the client stores read state as ciphertext on the relay and can read
 * it back, not the cipher itself.
 */
async function installNip07WithNip44(
  page: import("@playwright/test").Page,
  pubkey: string,
) {
  await page.addInitScript((extensionPubkey) => {
    const encode = (value: string) =>
      `enc:${btoa(unescape(encodeURIComponent(value)))}`;
    (
      window as Window & {
        nostr?: Record<string, unknown>;
      }
    ).nostr = {
      async getPublicKey() {
        return extensionPubkey;
      },
      async signEvent(event: Record<string, unknown>) {
        return {
          ...event,
          id: `ab${Math.random().toString(16).slice(2)}`
            .padEnd(64, "0")
            .slice(0, 64),
          pubkey: extensionPubkey,
          sig: "ef".repeat(64),
        };
      },
      nip44: {
        async encrypt(_peer: string, plaintext: string) {
          return encode(plaintext);
        },
        async decrypt(_peer: string, ciphertext: string) {
          return decodeURIComponent(
            escape(atob(ciphertext.replace(/^enc:/, ""))),
          );
        },
      },
    };
  }, pubkey);
}

test("read state is published to the relay, not kept in the browser", async ({
  page,
}) => {
  await installNip07WithNip44(page, "ab".repeat(32));
  const relay = mockRelay(page, {
    extraMessages: [markdownMessage("b", "something to read")],
  });
  await relay.install();

  await page.goto(`/c/${CHANNEL_UUID}`);
  await expect(page.getByText("something to read")).toBeVisible();

  await expect
    .poll(() =>
      relay.published.some(
        (event) => (event as { kind: number }).kind === 30078,
      ),
    )
    .toBe(true);

  // Exactly one write for one channel opened once. An earlier cut re-resolved
  // the signer every render, which changed the identity of the load effect's
  // dependencies and turned this into a republish loop.
  const writes = relay.published.filter(
    (event) => (event as { kind: number }).kind === 30078,
  );
  expect(writes).toHaveLength(1);

  const readState = writes[0] as { tags: string[][]; content: string };

  // The relay's watermark trigger rejects anything that does not match these.
  const dTag = readState.tags.find((tag) => tag[0] === "d");
  expect(dTag?.[1]).toMatch(/^read-state:[0-9a-f]{32}$/);
  expect(readState.tags).toContainEqual(["t", "read-state"]);

  // Stored as ciphertext: the relay operator holds a blob, not a record of what
  // this person has read.
  expect(readState.content).toMatch(/^enc:/);
  const blob = JSON.parse(
    Buffer.from(readState.content.replace(/^enc:/, ""), "base64").toString(
      "utf8",
    ),
  ) as { v: number; contexts: Record<string, number> };
  expect(blob.v).toBe(1);
  expect(blob.contexts[CHANNEL_UUID]).toBeGreaterThan(0);
});

test("a channel with activity past its cursor shows as unread", async ({
  page,
}) => {
  await installNip07WithNip44(page, "ab".repeat(32));

  const otherChannel = "22222222-2222-2222-2222-222222222222";
  const relay = mockRelay(page, {
    extraChannels: [
      {
        id: "ee".repeat(32),
        pubkey: "b".repeat(64),
        kind: 39000,
        created_at: 1_700_000_000,
        tags: [
          ["d", otherChannel],
          ["name", "elsewhere"],
          ["public"],
          ["t", "stream"],
        ],
        content: "",
        sig: "c".repeat(128),
      },
    ],
    // Newer than the cursor seeded below, so that room is unread.
    channelActivity: { [otherChannel]: 1_900_000_000 },
    readStateEvents: [
      {
        id: "dd".repeat(32),
        pubkey: "ab".repeat(32),
        kind: 30078,
        created_at: 1_700_000_000,
        tags: [
          ["d", `read-state:${"0".repeat(32)}`],
          ["t", "read-state"],
        ],
        // Cursor sits before the activity above, so that room is unread.
        content: `enc:${Buffer.from(
          JSON.stringify({
            v: 1,
            client_id: "desktop",
            contexts: { [otherChannel]: 1_800_000_000 },
          }),
        ).toString("base64")}`,
        sig: "f".repeat(128),
      },
    ],
  });
  await relay.install();

  await page.goto(`/c/${CHANNEL_UUID}`);

  // The badge is on the other room; the open one is being read right now.
  const nav = page.getByRole("navigation", { name: "Channels" });
  await expect(nav.getByText("Unread messages")).toHaveCount(1);

  // No subscription may carry message bodies for a channel the reader is not
  // looking at. A channel-less content filter is exactly that firehose, so its
  // absence is the guarantee.
  const firehose = relay.subscriptions.filter(
    (filter) => filter.kinds?.includes(9) && !filter["#h"],
  );
  expect(firehose).toEqual([]);

  // Nor may badges cost one request per channel. Every read that mentions a
  // specific channel is the content subscription for the room on screen; the
  // badge path must never name a channel at all.
  const perChannelBadgeWork = relay.queries
    .flat()
    .filter((filter) => filter["#h"]);
  expect(perChannelBadgeWork).toEqual([]);

  // What replaced both: one unscoped subscription for the snapshot kind. The
  // relay decides which shards this reader may see and addresses them, so the
  // client neither names channels nor names itself.
  const badgeSubs = relay.subscriptions.filter((filter) =>
    filter.kinds?.includes(39007),
  );
  expect(badgeSubs).toHaveLength(1);
  expect(badgeSubs[0].kinds).toEqual([39007]);
  expect(badgeSubs[0]["#h"]).toBeUndefined();
  expect(badgeSubs[0].authors).toBeUndefined();
});

test("a channel read past its newest message shows no badge", async ({
  page,
}) => {
  await installNip07WithNip44(page, "ab".repeat(32));

  const otherChannel = "22222222-2222-2222-2222-222222222222";
  const relay = mockRelay(page, {
    extraChannels: [
      {
        id: "ee".repeat(32),
        pubkey: "b".repeat(64),
        kind: 39000,
        created_at: 1_700_000_000,
        tags: [
          ["d", otherChannel],
          ["name", "elsewhere"],
          ["public"],
          ["t", "stream"],
        ],
        content: "",
        sig: "c".repeat(128),
      },
    ],
    // Exactly the cursor seeded below: that message has been read.
    channelActivity: { [otherChannel]: 1_800_000_000 },
    readStateEvents: [
      {
        id: "dd".repeat(32),
        pubkey: "ab".repeat(32),
        kind: 30078,
        created_at: 1_700_000_000,
        tags: [
          ["d", `read-state:${"0".repeat(32)}`],
          ["t", "read-state"],
        ],
        // Cursor sits on the activity above — it has been read.
        content: `enc:${Buffer.from(
          JSON.stringify({
            v: 1,
            client_id: "desktop",
            contexts: { [otherChannel]: 1_800_000_000 },
          }),
        ).toString("base64")}`,
        sig: "f".repeat(128),
      },
    ],
  });
  await relay.install();

  await page.goto(`/c/${CHANNEL_UUID}`);

  // Wait for the badge data to have actually arrived before asserting on the
  // absence of a badge, so the assertion cannot pass merely because nothing has
  // run yet.
  await expect
    .poll(() =>
      relay.queries.some((filters) =>
        filters.some((filter) => filter.kinds?.includes(39007)),
      ),
    )
    .toBe(true);

  const nav = page.getByRole("navigation", { name: "Channels" });
  await expect(nav.getByText("Unread messages")).toHaveCount(0);
});

test("searching puts the query in the URL and lists ranked hits", async ({
  page,
}) => {
  // Deliberately not in timestamp order: the relay returns FTS relevance order
  // and the client must not re-sort it.
  const relay = mockRelay(page, {
    searchPages: {
      1: [
        {
          id: "11".repeat(32),
          pubkey: "e".repeat(64),
          kind: 9,
          created_at: 1_600_000_000,
          tags: [["h", CHANNEL_UUID]],
          content: "the deploy pipeline is green",
          sig: "f".repeat(128),
        },
        {
          id: "22".repeat(32),
          pubkey: "e".repeat(64),
          kind: 9,
          created_at: 1_700_000_000,
          tags: [["h", CHANNEL_UUID]],
          content: "deploy notes for the release",
          sig: "f".repeat(128),
        },
      ],
    },
  });
  await relay.install();

  await page.goto(`/c/${CHANNEL_UUID}`);
  await page.getByRole("searchbox", { name: /^Search/ }).fill("deploy");
  await page.getByRole("searchbox", { name: /^Search/ }).press("Enter");

  // In the URL, so the result set is linkable and survives a reload.
  await expect(page).toHaveURL(/[?&]q=deploy/);

  await expect(page.getByText("the deploy pipeline is green")).toBeVisible();
  await expect(page.getByText("deploy notes for the release")).toBeVisible();

  // Server ranking preserved: the older hit ranked first and stays first.
  const rendered = await page.getByRole("listitem").allTextContents();
  const first = rendered.findIndex((text) =>
    text.includes("pipeline is green"),
  );
  const second = rendered.findIndex((text) => text.includes("notes for the"));
  expect(first).toBeLessThan(second);

  // Kinds are mandatory — an open-ended search 403s at the relay's p-gate.
  expect(relay.searchRequests).not.toHaveLength(0);
  expect(relay.searchRequests[0].kinds?.length ?? 0).toBeGreaterThan(0);
  expect(relay.searchRequests[0].search).toBe("deploy");
});

test("a search inside a channel is narrowed on the server", async ({
  page,
}) => {
  const relay = mockRelay(page, { searchPages: { 1: [] } });
  await relay.install();

  await page.goto(`/c/${CHANNEL_UUID}`);
  await page.getByRole("searchbox", { name: /^Search/ }).fill("deploy");
  await page.getByRole("searchbox", { name: /^Search/ }).press("Enter");

  await expect(page.getByText(/No messages match/)).toBeVisible();
  // Narrowing client-side would fill each page with hits from other channels
  // and then discard most of them.
  expect(relay.searchRequests[0]["#h"]).toEqual([CHANNEL_UUID]);
});

test("a result opens the message it points at", async ({ page }) => {
  // A realistic id: 64 hex chars including letters. An all-digit id would parse
  // as a JSON number, and the router quotes such a value so it round-trips —
  // correct, but not the shape a reader would copy out of the address bar.
  const HIT_ID = "3a".repeat(32);

  const relay = mockRelay(page, {
    searchPages: {
      1: [
        {
          id: HIT_ID,
          pubkey: "e".repeat(64),
          kind: 9,
          created_at: 1_700_000_000,
          tags: [["h", CHANNEL_UUID]],
          content: "the thing you were looking for",
          sig: "f".repeat(128),
        },
      ],
    },
  });
  await relay.install();

  await page.goto(`/c/${CHANNEL_UUID}?q=looking`);
  // The href a reader could copy, before any client-side navigation.
  await expect(
    page.getByRole("link", { name: /the thing you were looking for/ }),
  ).toHaveAttribute("href", `/c/${CHANNEL_UUID}?m=${HIT_ID}`);

  await page.getByText("the thing you were looking for").click();

  // Anchors the timeline on that message and drops `q`, so the URL does not
  // claim to be both a search and a message view.
  await expect(page).toHaveURL(new RegExp(`m=${HIT_ID}`));
  await expect(page).not.toHaveURL(/[?&]q=/);
});

test("clearing the search returns to the timeline", async ({ page }) => {
  const relay = mockRelay(page, { searchPages: { 1: [] } });
  await relay.install();

  await page.goto(`/c/${CHANNEL_UUID}?q=deploy`);
  await expect(page.getByText(/No messages match/)).toBeVisible();

  await page.getByRole("button", { name: "Clear search" }).click();

  await expect(page).not.toHaveURL(/[?&]q=/);
  await expect(page.getByText("hello from the mocked relay")).toBeVisible();
});

test("older history is paged in with a composite cursor", async ({ page }) => {
  const older = Array.from({ length: 3 }, (_unused, index) => ({
    id: `0${index}`.padEnd(64, "a"),
    pubkey: "e".repeat(64),
    kind: 9,
    created_at: 1_600_000_000 + index,
    tags: [["h", CHANNEL_UUID]],
    content: `older message ${index}`,
    sig: "f".repeat(128),
  }));

  const relay = mockRelay(page, { olderMessages: older });
  await relay.install();

  await page.goto(`/c/${CHANNEL_UUID}`);
  await expect(page.getByText("hello from the mocked relay")).toBeVisible();
  await expect(page.getByText("older message 0")).toHaveCount(0);

  await page.getByRole("button", { name: "Load older messages" }).click();

  await expect(page.getByText("older message 0")).toBeVisible();
  await expect(page.getByText("older message 2")).toBeVisible();
  // The live tail is still there: a page of history must extend the timeline,
  // not replace it.
  await expect(page.getByText("hello from the mocked relay")).toBeVisible();

  // The cursor is the oldest row that was on screen, sent as both halves. A
  // timestamp alone would drop or repeat rows sharing that second.
  expect(relay.historyRequests).toHaveLength(1);
  expect(relay.historyRequests[0].beforeId).toMatch(/^[0-9a-f]{64}$/);
  expect(relay.historyRequests[0].until).toBeGreaterThan(0);
});

test("a short page ends the scrollback", async ({ page }) => {
  // The general query path has no `kind:39006` bounds overlay, so a short page
  // is the only exhaustion signal available. It must actually stop the control.
  const relay = mockRelay(page, {
    olderMessages: [
      {
        id: "0a".padEnd(64, "b"),
        pubkey: "e".repeat(64),
        kind: 9,
        created_at: 1_600_000_000,
        tags: [["h", CHANNEL_UUID]],
        content: "the first thing anyone said",
        sig: "f".repeat(128),
      },
    ],
  });
  await relay.install();

  await page.goto(`/c/${CHANNEL_UUID}`);
  await page.getByRole("button", { name: "Load older messages" }).click();

  await expect(page.getByText("the first thing anyone said")).toBeVisible();
  await expect(page.getByText("Beginning of the channel")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Load older messages" }),
  ).toHaveCount(0);
});

test("paging in history keeps the reader where they were", async ({ page }) => {
  // Prepending rows pushes everything down. Following the tail on row count —
  // which is what the timeline did before scrollback existed — would throw the
  // reader to the bottom, out of the history they just asked for.
  const older = Array.from({ length: 40 }, (_unused, index) => ({
    id: `${index}`.padStart(2, "0").padEnd(64, "c"),
    pubkey: "e".repeat(64),
    kind: 9,
    created_at: 1_600_000_000 + index,
    tags: [["h", CHANNEL_UUID]],
    content: `older message ${index}`,
    sig: "f".repeat(128),
  }));

  const relay = mockRelay(page, {
    olderMessages: older,
    // Enough live rows that the viewport actually scrolls.
    extraMessages: Array.from({ length: 40 }, (_unused, index) => ({
      id: `${index}`.padStart(2, "0").padEnd(64, "d"),
      pubkey: "e".repeat(64),
      kind: 9,
      created_at: 1_700_000_200 + index,
      tags: [["h", CHANNEL_UUID]],
      content: `recent message ${index}`,
      sig: "f".repeat(128),
    })),
  });
  await relay.install();

  await page.goto(`/c/${CHANNEL_UUID}`);
  await expect(page.getByText("recent message 39")).toBeVisible();

  const scroller = page.locator("div.overflow-y-auto").first();
  await scroller.evaluate((el) => {
    el.scrollTop = 0;
  });

  const before = await scroller.evaluate((el) => ({
    fromBottom: el.scrollHeight - el.scrollTop,
  }));

  await page.getByRole("button", { name: "Load older messages" }).click();
  await expect(page.getByText("older message 39")).toBeVisible();

  const after = await scroller.evaluate((el) => ({
    fromBottom: el.scrollHeight - el.scrollTop,
    scrollTop: el.scrollTop,
  }));

  // Distance from the bottom is what a prepend leaves unchanged, so restoring it
  // puts the reader back on the same row.
  expect(Math.abs(after.fromBottom - before.fromBottom)).toBeLessThan(4);
  // And they are demonstrably not at the bottom, which is the failure this
  // guards against.
  expect(after.scrollTop).toBeGreaterThan(0);
});

test("attaching a file uploads it and publishes its imeta", async ({
  page,
}) => {
  const relay = mockRelay(page);
  await relay.install();

  // The relay authorizes an upload for one exact file: the X-SHA-256 header and
  // the kind:24242 auth event's `x` tag must agree, or it is rejected. The mock
  // enforces that, so a client that signs for different bytes than it sends
  // fails here rather than in production.
  let uploadRequest: { sha256: string | undefined; authX: string | undefined } =
    { sha256: undefined, authX: undefined };
  await page.route("**/upload", async (route) => {
    const headers = route.request().headers();
    const auth = headers.authorization ?? "";
    const authEvent = JSON.parse(
      Buffer.from(auth.replace(/^Nostr /, ""), "base64").toString("utf8"),
    ) as { kind: number; tags: string[][]; content: string };

    uploadRequest = {
      sha256: headers["x-sha-256"],
      authX: authEvent.tags.find((tag) => tag[0] === "x")?.[1],
    };

    expect(route.request().method()).toBe("PUT");
    expect(authEvent.kind).toBe(24242);
    expect(authEvent.tags).toContainEqual(["t", "upload"]);
    // BUD-11 requires a non-empty reason and the relay rejects a blank one.
    expect(authEvent.content.trim().length).toBeGreaterThan(0);

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        url: "https://relay.test/media/cat.png",
        sha256: uploadRequest.sha256,
        size: 5,
        type: "image/png",
        uploaded: 1_700_000_000,
        dim: "800x600",
      }),
    });
  });

  await page.goto(`/c/${CHANNEL_UUID}`);
  await page
    .getByRole("textbox", { name: /^Message #/ })
    .waitFor({ state: "visible" });

  await page.locator('input[type="file"]').setInputFiles({
    name: "cat.png",
    mimeType: "image/png",
    buffer: Buffer.from("hello"),
  });

  // The attachment is uploaded on pick, not on send: a send that had to upload
  // first would fail the message along with the transfer.
  await expect(
    page.getByRole("button", { name: "Remove cat.png" }),
  ).toBeVisible();
  expect(uploadRequest.sha256).toBe(uploadRequest.authX);
  expect(uploadRequest.sha256).toMatch(/^[0-9a-f]{64}$/);

  await page.getByRole("button", { name: "Send" }).click();

  await expect
    .poll(() => relay.published.some((e) => (e as { kind: number }).kind === 9))
    .toBe(true);
  const message = relay.published.find(
    (e) => (e as { kind: number }).kind === 9,
  ) as { tags: string[][]; content: string };

  const imeta = message.tags.find((tag) => tag[0] === "imeta");
  expect(imeta).toBeDefined();
  expect(imeta).toContain("url https://relay.test/media/cat.png");
  // Without `dim` the timeline jumps when the image decodes.
  expect(imeta).toContain("dim 800x600");
  // And the URL must reach the body, because the renderer keys imeta off the
  // URL it finds there — a tag alone renders nothing.
  expect(message.content).toContain("https://relay.test/media/cat.png");
});

test("a refused upload keeps the message and says why", async ({ page }) => {
  const relay = mockRelay(page);
  await relay.install();

  await page.route("**/upload", async (route) => {
    await route.fulfill({ status: 413, body: "too big" });
  });

  await page.goto(`/c/${CHANNEL_UUID}`);
  const composer = page.getByRole("textbox", { name: /^Message #/ });
  await composer.fill("look at this");

  await page.locator('input[type="file"]').setInputFiles({
    name: "big.png",
    mimeType: "image/png",
    buffer: Buffer.from("x"),
  });

  // Actionable, not a status code.
  await expect(page.getByText(/too large/i)).toBeVisible();
  // The typed text survives, and nothing half-attached is left behind to be
  // published as a broken link.
  await expect(composer).toHaveValue("look at this");
  await expect(page.getByRole("button", { name: /^Remove / })).toHaveCount(0);
});

test("a typing indicator appears and clears when the message lands", async ({
  page,
}) => {
  const typist = "cc".repeat(32);
  const relay = mockRelay(page, {
    typingEvents: [
      {
        id: "11".repeat(32),
        pubkey: typist,
        kind: 20002,
        // Within the 8s TTL of "now", so the indicator is live on arrival.
        created_at: Math.floor(Date.now() / 1000),
        tags: [["h", CHANNEL_UUID]],
        content: "",
        sig: "f".repeat(128),
      },
    ],
  });
  await relay.install();

  await page.goto(`/c/${CHANNEL_UUID}`);
  await expect(page.getByText(/is typing…/)).toBeVisible();

  // Sending clears the reader's own row; the typist's clears when their message
  // arrives, which the mock echoes back on the live subscription.
  const composer = page.getByRole("textbox", { name: /^Message #/ });
  await composer.fill("done");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("done")).toBeVisible();
});

test("typing while composing publishes kind:20002 scoped to the channel", async ({
  page,
}) => {
  const relay = mockRelay(page);
  await relay.install();

  await page.goto(`/c/${CHANNEL_UUID}`);
  await page.getByRole("textbox", { name: /^Message #/ }).fill("half a thou");

  await expect
    .poll(() =>
      relay.published.some(
        (event) => (event as { kind: number }).kind === 20002,
      ),
    )
    .toBe(true);

  const typing = relay.published.find(
    (event) => (event as { kind: number }).kind === 20002,
  ) as { tags: string[][]; content: string };
  expect(typing.tags).toContainEqual(["h", CHANNEL_UUID]);
  // Content is empty: the indicator says "someone is composing", never what.
  expect(typing.content).toBe("");
});

test("presence comes from the HTTP snapshot, which is the only path that has it", async ({
  page,
}) => {
  // Ephemeral events are never stored, so a WebSocket REQ has nothing to
  // return; `POST /query` is where the relay synthesizes status out of Redis.
  const relay = mockRelay(page, {
    presenceEvents: [
      {
        id: "22".repeat(32),
        pubkey: "e".repeat(64),
        kind: 20001,
        created_at: Math.floor(Date.now() / 1000),
        tags: [],
        content: "online",
        sig: "f".repeat(128),
      },
    ],
  });
  await relay.install();

  await page.goto(`/c/${CHANNEL_UUID}`);
  await expect(page.getByText("hello from the mocked relay")).toBeVisible();

  await expect(page.getByText("Status: online")).toBeAttached();

  const presence = relay.queries
    .flat()
    .find((filter) => filter.kinds?.includes(20001));
  expect(presence?.kinds).toEqual([20001]);
  // The relay only synthesizes for filters that name authors explicitly.
  expect(presence?.authors?.length).toBeGreaterThan(0);
  // Presence and unread share the endpoint but never the request: mixing them
  // would tie a status refresh to the badge poll's cadence and vice versa.
  for (const filters of relay.queries) {
    const kinds = new Set(filters.flatMap((filter) => filter.kinds ?? []));
    expect(kinds.has(20001) && kinds.has(9)).toBe(false);
  }
});

test("read cursors advanced during a publish are not lost", async ({
  page,
}) => {
  await installNip07WithNip44(page, "ab".repeat(32));

  const otherChannel = "33333333-3333-3333-3333-333333333333";
  const relay = mockRelay(page, {
    // Hold the first write open so the second cursor advances mid-publish —
    // without this the two never overlap and the race is not exercised.
    delayReadStateOkMs: 1_500,
    extraChannels: [
      {
        id: "77".repeat(32),
        pubkey: "b".repeat(64),
        kind: 39000,
        created_at: 1_700_000_000,
        tags: [
          ["d", otherChannel],
          ["name", "second"],
          ["public"],
          ["t", "stream"],
        ],
        content: "",
        sig: "c".repeat(128),
      },
    ],
  });
  await relay.install();

  // Read one room and immediately switch to another, so the second cursor
  // advances while the first publish is still in flight.
  await page.goto(`/c/${CHANNEL_UUID}`);
  await page
    .getByRole("navigation", { name: "Channels" })
    .getByText("second")
    .click();
  await expect(page.getByRole("heading", { name: "#second" })).toBeVisible();

  const cursorsOf = (event: unknown) =>
    (
      JSON.parse(
        Buffer.from(
          (event as { content: string }).content.replace(/^enc:/, ""),
          "base64",
        ).toString("utf8"),
      ) as { contexts: Record<string, number> }
    ).contexts;

  // The newest write must carry both rooms: dropping the second would leave a
  // cursor that only ever existed in this tab, and the badge returns on reload.
  await expect
    .poll(() => {
      const writes = relay.published.filter(
        (event) => (event as { kind: number }).kind === 30078,
      );
      if (writes.length === 0) return null;
      return Object.keys(cursorsOf(writes[writes.length - 1])).sort();
    })
    .toEqual([CHANNEL_UUID, otherChannel].sort());
});

test("a signer without NIP-44 is told unread sync is unavailable", async ({
  page,
}) => {
  // NIP-44 is optional in NIP-07 and some extensions omit it. Marking a channel
  // read must not look like it worked when nothing can be persisted.
  await page.addInitScript((extensionPubkey) => {
    (window as Window & { nostr?: Record<string, unknown> }).nostr = {
      async getPublicKey() {
        return extensionPubkey;
      },
      async signEvent(event: Record<string, unknown>) {
        return {
          ...event,
          id: "ab".repeat(32),
          pubkey: extensionPubkey,
          sig: "ef".repeat(64),
        };
      },
      // No nip44 member at all.
    };
  }, "ab".repeat(32));

  const relay = mockRelay(page);
  await relay.install();

  await page.goto(`/c/${CHANNEL_UUID}`);

  await expect(page.getByText("unread sync off")).toBeVisible();
  // And nothing is written, rather than a write that silently fails.
  await expect
    .poll(
      () =>
        relay.published.filter(
          (event) => (event as { kind: number }).kind === 30078,
        ).length,
    )
    .toBe(0);
});
