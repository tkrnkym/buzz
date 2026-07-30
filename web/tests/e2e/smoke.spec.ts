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
  options: { extraMessages?: unknown[] } = {},
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
              } else if (filter.kinds.includes(9)) {
                ws.send(JSON.stringify(["EVENT", subId, message]));
                for (const extra of options.extraMessages ?? []) {
                  ws.send(JSON.stringify(["EVENT", subId, extra]));
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

  expect(relay.published).toHaveLength(1);
  const event = relay.published[0] as {
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
