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
                "https://github.com/block/buzz/releases/download/v0.4.9/Buzz_0.4.9_aarch64.dmg",
            },
            {
              name: "Buzz_0.4.9_x64.dmg",
              browser_download_url:
                "https://github.com/block/buzz/releases/download/v0.4.9/Buzz_0.4.9_x64.dmg",
            },
            {
              name: "Buzz_0.4.9_amd64.AppImage",
              browser_download_url:
                "https://github.com/block/buzz/releases/download/v0.4.9/Buzz_0.4.9_amd64.AppImage",
            },
            {
              name: "Buzz_0.4.9_x64-setup_alpha-unsigned.exe",
              browser_download_url:
                "https://github.com/block/buzz/releases/download/v0.4.9/Buzz_0.4.9_x64-setup_alpha-unsigned.exe",
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
    "https://github.com/block/buzz/releases/download/v0.4.9/Buzz_0.4.9_x64-setup_alpha-unsigned.exe",
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
  await expect(openedPage).toHaveURL("https://github.com/block/buzz/releases");
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
                  "https://github.com/block/buzz/releases/download/v0.4.9/Buzz_0.4.9_x64.dmg",
              },
              {
                name: "Buzz_0.4.9_amd64.AppImage",
                browser_download_url:
                  "https://github.com/block/buzz/releases/download/v0.4.9/Buzz_0.4.9_amd64.AppImage",
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
    ).toHaveAttribute("href", "https://github.com/block/buzz/releases");
    await context.close();
  }
});

/**
 * Chat surface, driven against a mocked relay WebSocket.
 *
 * `page.routeWebSocket` handles the connection entirely in-process, so the spec
 * exercises the real NIP-42 handshake, REQ/EVENT/EOSE dispatch, and publish path
 * without a Postgres/Redis-backed relay.
 */
function mockRelay(
  page: import("@playwright/test").Page,
  options: {
    extraMessages?: unknown[];
    auxEvents?: unknown[];
    /** Served to the unscoped activity read that drives unread badges. */
    activityEvents?: unknown[];
    /** Extra kind:39000 metadata, for rooms beyond the default one. */
    extraChannels?: unknown[];
    /** Served to the kind:30078 read-state read. */
    readStateEvents?: unknown[];
    /** Served to the kind:20002 typing subscription. */
    typingEvents?: unknown[];
  } = {},
) {
  const published: unknown[][] = [];

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

  return {
    published,
    install: () =>
      page.routeWebSocket(
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
              ws.send(JSON.stringify(["OK", frame[1].id, true, ""]));
              // Echo it back on the live subscription, as a relay would.
              ws.send(JSON.stringify(["EVENT", "s1", frame[1]]));
              return;
            }

            if (verb === "REQ") {
              const [, subId, filter] = frame;
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
                ws.send(JSON.stringify(["EVENT", subId, message]));
                for (const extra of options.extraMessages ?? []) {
                  ws.send(JSON.stringify(["EVENT", subId, extra]));
                }
              } else if (filter.kinds.includes(9)) {
                // Unscoped by channel: the activity read behind unread badges.
                for (const activity of options.activityEvents ?? []) {
                  ws.send(JSON.stringify(["EVENT", subId, activity]));
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
      ),
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
  // Root === parent for a direct reply, which buzz-sdk collapses to one tag.
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
    // Channel metadata for a second room the reader is not looking at.
    activityEvents: [
      {
        id: "cc".repeat(32),
        pubkey: "e".repeat(64),
        kind: 9,
        created_at: 1_900_000_000,
        tags: [["h", otherChannel]],
        content: "newer than the cursor",
        sig: "f".repeat(128),
      },
    ],
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
  let presenceQueried = false;
  await page.route("**/query", async (route) => {
    presenceQueried = true;
    const body = JSON.parse(route.request().postData() ?? "{}") as {
      filters: Array<{ kinds: number[]; authors?: string[] }>;
    };
    expect(body.filters[0].kinds).toEqual([20001]);
    // The relay only synthesizes for filters that name authors explicitly.
    expect(body.filters[0].authors?.length).toBeGreaterThan(0);

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "22".repeat(32),
          pubkey: "e".repeat(64),
          kind: 20001,
          created_at: Math.floor(Date.now() / 1000),
          tags: [],
          content: "online",
          sig: "f".repeat(128),
        },
      ]),
    });
  });

  const relay = mockRelay(page);
  await relay.install();

  await page.goto(`/c/${CHANNEL_UUID}`);
  await expect(page.getByText("hello from the mocked relay")).toBeVisible();

  await expect.poll(() => presenceQueried).toBe(true);
  await expect(page.getByText("Status: online")).toBeAttached();
});
