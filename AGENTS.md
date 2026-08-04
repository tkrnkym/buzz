# AGENTS.md — AI Agent Contributor Guide

This guide is for AI agents contributing to the Nuxx codebase. It covers
agent-specific context and conventions. For general contributor info (setup,
code style, PR process, architecture), see [CONTRIBUTING.md](CONTRIBUTING.md).

---

## Ecosystem

This repository is the whole product for this fork: relay, web client, mobile
app, CLI, and agent harness all live here.

Deployment is whatever you wire up in `deploy/`; the relay image publishes to
`ghcr.io/tkrnkym/nuxx` from `.github/workflows/docker.yml`.

See [RELEASING.md](RELEASING.md) for the release flows that do exist here.

---

## Repo Structure

```
crates/
  # Relay + core
  nuxx-relay          # WebSocket relay server — main entry point; also hosts git + huddle audio
  nuxx-core           # Core types, event verification, filter matching, kind registry
  nuxx-db             # Postgres event store and data access layer
  nuxx-auth           # Authentication and authorization
  nuxx-pubsub         # Redis pub/sub fan-out, presence, typing indicators
  nuxx-search         # Postgres FTS full-text search
  nuxx-audit          # Hash-chain audit log
  nuxx-media          # Blossom/S3 media storage
  # Agent surface
  nuxx-acp            # ACP harness bridging Nuxx events to AI agents
  nuxx-agent          # Minimal ACP-compliant agent (non-streaming, tool-calls-as-output)
  nuxx-dev-mcp        # Developer MCP server — shell + file-edit tools
  nuxx-persona        # Agent persona packs
  nuxx-workflow       # YAML-as-code workflow engine (evalexpr conditions)
  # Clients + interop
  git-sign-nostr      # Sign git objects with a Nostr key
  git-credential-nostr # Git credential helper for Nostr-authed push/fetch
  # Tooling + shared
  nuxx-cli            # Agent-first CLI
  nuxx-sdk            # Typed Nostr event builders
  nuxx-admin          # Operator CLI for relay administration
  nuxx-ws-client      # Shared NIP-42 WebSocket client (connect, auth, publish)
  nuxx-test-client    # Integration test client and E2E test suite
  sprig               # All-in-one harness bundling ACP, agent, and dev MCP

web/                  # Browser web client (repo browser, served by the relay)
mobile/               # Flutter mobile app
migrations/           # SQL migrations (auto-applied on relay startup)
scripts/              # Dev tooling
.env.example          # Config template — copy to .env before running
```

---

## Getting Started

```bash
. ./bin/activate-hermit   # activate hermit toolchain (Rust, Node, etc.)
cp .env.example .env      # configure local environment
just setup                # install deps, run migrations
just relay                # start relay at ws://localhost:3000
just ci                   # run before any PR
```

See CONTRIBUTING.md for full setup details and dependency requirements.

---

## Quality Gates

Run `just ci` before every PR — it runs `fmt` + `clippy` + web lint +
unit tests + builds. Clippy passing does not mean fmt passes; run both.

Run `just test` for integration tests if you touched `nuxx-relay`,
`nuxx-db`, or `nuxx-auth` — these require a running Postgres and Redis.

**Pre-commit hooks** are installed automatically by `just setup` and auto-fix
formatting via `stage_fixed`. Pre-commit runs fix variants in parallel (Rust
fmt, web biome fix, mobile dart format).
Auto-fixable issues are fixed and re-staged; unfixable lint issues block the
commit. **Pre-push hooks** run clippy (workspace + Tauri) and fast unit tests
in parallel (Rust, web JS, mobile Flutter) — no overlap with
pre-commit. Builds are CI-only. Run `just fix-all` to auto-fix all formatting
in one shot. Run `just ci` for the full local gate. Run `just hooks` to
re-install hooks after env changes. Before agents run Git or hooks, activate the
repo's Hermit environment (`. ./bin/activate-hermit`); do not rewrite hook
commands to compensate for an unconfigured shell `PATH`.

**Commit with `git commit -s`.** The required **DCO Check** fails any PR with a commit missing a `Signed-off-by` trailer, and `just hooks` installs a `commit-msg` hook that adds it to commits you create locally (`git rebase` and `git cherry-pick` still need `--signoff`) — if you build commit commands programmatically, include `-s` every time. To repair a branch that already has unsigned commits: `git rebase --signoff main`, then force-push.

Additional rules:
- No `unsafe` code
- Do not introduce new `unwrap()` or `expect()` in production paths — use `?` and proper error types
- New public API must have doc comments

---

## Key Patterns

**Nostr-first HTTP surface**: Nuxx's primary API is NIP-29 over WebSocket. The relay also exposes a narrow HTTP surface: NIP-11/NIP-05 metadata, `POST /events`, `POST /query`, `POST /count`, workflow webhooks at `/hooks/{id}`, Blossom media, git smart HTTP, git policy hooks, and health probes. These HTTP paths all preserve the same host-derived community boundary.

**Prefer Nostr events over new HTTP endpoints**: For new feature work, model
the operation as a Nostr event (new kind in `nuxx-core/src/kind.rs`, handler
in `nuxx-relay`) rather than adding endpoint-specific JSON APIs. HTTP is
reserved for things that genuinely need an HTTP-only surface: media upload/download
(Blossom), webhooks, git smart HTTP, NIP-11/NIP-05 metadata, health checks,
and the generic Nostr bridge endpoints:

- `POST /events` — submit any signed event (same path the WebSocket uses).
- `POST /query` — Nostr REQ filters over HTTP. NIP-50 `search` filters
  are routed to `nuxx-search` (Postgres FTS) automatically.
- `POST /count` — Nostr COUNT filters over HTTP.

If you find yourself reaching for a new HTTP endpoint, first check whether
an event kind would do the job — it usually will, and you get realtime
fan-out, NIP-29 scoping, and the existing auth pipeline for free.

Reference https://github.com/nostr-protocol/nips

**Event kinds**: All event kind integers are defined in
`nuxx-core/src/kind.rs`. New features get new kind integers — add them here
first, then implement handling in the relay.

**Channel scoping**: Channels use `h` tags (NIP-29 group tag), not `e` tags.
Filters and queries must scope to `h` tags when operating within a channel.

**Agent-facing operations go in `nuxx-cli`**: New agent-facing features belong in `nuxx-cli` — add a subcommand there first, then wire the REST/WebSocket call in `client.rs`. `nuxx-dev-mcp` (shell + file tools for `nuxx-agent`) is separate.

**Workflow conditions**: `nuxx-workflow` uses
[evalexpr](https://docs.rs/evalexpr) for condition evaluation. Keep expressions
simple and testable.

**Thread counters**: `reply_count` and `descendant_count` are materialized on
thread root events. Any code that inserts replies must update these counters —
check existing reply handlers for the pattern.

---

## Agent CLI (`nuxx-cli`)

`nuxx` is the agent-first CLI. Auth env vars
(`NUXX_RELAY_URL`, `NUXX_PRIVATE_KEY`, `NUXX_AUTH_TAG`) are auto-injected
by the ACP harness into managed agent subprocesses. In development, set
`NUXX_PRIVATE_KEY` and `NUXX_RELAY_URL` in your environment manually.

### Building the CLI

```bash
cargo build --release -p nuxx-cli
```

Binary location: `./target/release/nuxx`. Add `./target/release` to `PATH`
or invoke with the full path.

### Deep Links

`nuxx://message?channel=<uuid>&id=<hex>` links reference a specific message
thread. To read the linked thread:

```bash
nuxx messages thread --channel <uuid> --event <hex> --format compact
```

Extract `channel` and `id` from the URL query parameters. The optional
`thread` parameter (root event ID) can be ignored — `messages thread` resolves
the full thread from the event ID alone.

All reads return sig-stripped JSON arrays; all writes return
`{event_id, accepted, message}`; creates add the entity ID. Exit codes:
0=ok, 1=input error, 2=network/relay, 3=auth, 4=other, 5=write conflict (NIP-33 LWW).

`--format compact` is a **global** flag — it goes before the subcommand:
`nuxx --format compact channels list`, NOT `nuxx channels list --format compact`.

See `crates/nuxx-cli/TESTING.md` for the full live-testing runbook.

---

## Testing

```bash
just test-unit    # unit tests, no infrastructure needed
just test         # full integration suite (requires Postgres + Redis)
```

E2E tests live in `crates/nuxx-test-client/tests/`:
- `e2e_relay.rs` — WebSocket relay protocol
- `e2e_media.rs` — media upload/download (Blossom)
- `e2e_media_extended.rs` — extended media scenarios
- `e2e_nostr_interop.rs` — Nostr interop (NIP-50 search, NIP-10 threads, NIP-17 gift wraps)

Web E2E: `just web-e2e` (or `pnpm -C web test:e2e`). Two Playwright projects
over two bundles, because the mock-up screens only have data in one of them:

- `smoke` — `tests/e2e/smoke.spec.ts` against the ordinary bundle (`dist/`,
  port 4173). Run alone with `just web-e2e-smoke`.
- `showcase` — `tests/e2e/showcase.spec.ts` against the demo bundle
  (`VITE_MOCK_RELAY=1` → `dist-mock/`, port 4174), where `src/mock/showcase.ts`
  backs Workflows / Agents / Projects / Forum / Reminders / members / huddle /
  Pulse. Run alone with `just web-e2e-showcase`.

Both `pnpm build` and `pnpm build:mock` run before either project, since
Playwright starts both preview servers regardless of which project is selected.
A new spec file needs a `testMatch` entry on one of the two projects in
`web/playwright.config.ts` or it will not run at all.

See [TESTING.md](TESTING.md) for the full multi-agent E2E guide.

### PR Screenshots

> **Do NOT use `nuxx upload`, the relay media endpoint, or any third-party
> image host for PR screenshots.** Relay media URLs fail through GitHub's camo
> proxy. Always use `scripts/post-screenshots.sh` for PNGs before linking them
> from a PR body/comment. If you hand-edit PR markdown, run
> `scripts/check-pr-image-urls.sh <markdown-file>` first to catch relay URLs.

For mobile simulator screenshots, save the PNGs in a local directory and run
`./scripts/post-screenshots.sh <PR-number> <png-dir>` or use the third argument
with a markdown template containing `{{filename}}` placeholders.

For the web client, capture screenshots from a Playwright spec (see
`web/tests/e2e/smoke.spec.ts`) and write the PNGs somewhere under
`web/test-results/`. There is no `just` screenshot recipe: the desktop app
needed one because it could not render outside a Tauri webview, and the web
client has no such constraint — `pnpm -C web exec playwright test` drives a real
browser directly.

`scripts/post-screenshots.sh` hosts PNGs on a per-developer branch
(`agent-screenshots/<github-username>`) and posts a PR comment with
commit-SHA-based image URLs (immutable — safe from later overwrites):

```bash
./scripts/post-screenshots.sh 803 test-results/screenshots
./scripts/post-screenshots.sh 803 test-results/screenshots body.md  # custom body prepended
```

The body file supports `{{filename}}` placeholders (without `.png`) to inline
images at specific positions. Images not referenced by any placeholder are
appended at the end. Without placeholders, all images are appended (backward
compatible).

```markdown
### Unread dot
A message arrives in `#random`.

{{01-unread-dot}}

### Context menu
Right-click shows "Mark as read".

{{02-context-menu}}
```

Re-runs overwrite the image blobs on the `agent-screenshots/<username>`
branch, but the script **appends a new PR comment** — it does not edit or
delete the previous one. After reposting, delete the superseded comment so
only the current set remains, otherwise reviewers still see the stale images:

```bash
# List screenshot comments to find the stale one's id
gh pr view <pr> --repo tkrnkym/nuxx --json comments \
  --jq '.comments[] | select(.body | test("pr-<pr>--")) | {id, url}'
gh api -X DELETE repos/tkrnkym/nuxx/issues/comments/<stale-comment-id>
```

Branch cleanup when fully done: `git push origin --delete agent-screenshots/<username>`.

### Writing E2E Screenshot Specs

Add specs to `web/tests/e2e/` and register them in `web/playwright.config.ts`.

**Distinct states — verify before posting:** when one view renders many
elements at once (e.g. all team cards in a single grid), an unscoped full-page
`page.screenshot()` captures the *same* pixels for every shot, so multiple PNGs
come out byte-identical. Scope each shot to its subject with
`locator.screenshot()` (full-page `clip` only when an overlay like an open
dropdown must be included). Then gate on hash distinctness before posting:

```bash
shasum -a 256 web/test-results/<dir>/*.png   # every hash must be unique
```

Identical hashes mean two shots captured the same state — fix the spec, do not
post. This catches the most common screenshot regression.

**Animation timing:** components animate in via CSS. `toBeVisible()` resolves
mid-animation — wait for completion before screenshotting:

```ts
await element.evaluate((el) =>
  Promise.all(el.getAnimations().map((a) => a.finished)),
);
```

**Cropping:** full-window (1280x720) screenshots are unreadable for small
features. Scope to the subject.

**PR comments:** Use a body template (3rd arg to `post-screenshots.sh`) with
`{{filename}}` placeholders. Each screenshot gets a `###` heading + one-line
description.

## Common Gotchas

1. **Kind `39000` for channel metadata, not `41`** — kind 41 is NIP-01 (unused). All kinds defined in `nuxx-core/src/kind.rs`.
2. **Relay queries must specify `kinds`** — omitting `kinds` triggers the p-gate (403). Always include explicit kind filters.
3. **`messages search` must include `--kinds`** — an open-ended search (no kinds) hits the relay p-gate and returns 403. Pass at least `--kinds 9,45001,45003` to scope the query.
4. **Worktrees: `cd` in the same command** — shell CWD doesn't persist between tool calls. Use `cd /path && cargo build` as one command.
5. **React render perf: `React.memo` is all-or-nothing** — it only skips a re-render when *every* prop is reference-stable; one unstable prop (inline arrow/JSX, or a hook returning a fresh `{}`/`[]`/`Map` each render) defeats it. Two repeat offenders: (a) React Query results (`useMutation`/`useQuery`) are a **new object each render** — depend on the stable method (`mutation.mutateAsync`), not the object; (b) derived `Map`/array state that recomputes on a version bump — wrap in a content-equality ref cache (`shared/hooks/useStableReference.ts`). When chasing interaction lag, **measure with DevTools closed and no perf probes** (an open Web Inspector + per-keystroke `console.log` inflate the numbers), and isolate by removing one suspect at a time rather than guessing.
6. **A popup inside a dialog must portal into the dialog** — `shared/ui/dialog.tsx` uses the native `<dialog>` with `showModal()`, which promotes it to the browser's **top layer**. The top layer paints above the entire document regardless of `z-index`, so a menu portalled to `document.body` (Radix's default) renders *underneath* the dialog and receives no clicks at all — it is present in the DOM and visible to a locator, which is why this reads as "the click is intercepted" rather than "the menu is missing". `DropdownMenuContent` handles it by portalling into the dialog element via `useDialogContainer()`; anything new that portals needs the same treatment.
7. **UI primitives: use the one that exists** — `shared/ui/` has Radix-backed `dropdown-menu`, `context-menu`, `popover`, `tabs`, `switch` and `checkbox` *and* a hand-rolled `menu.tsx` (portalled, flat, no collision handling). Prefer the Radix ones for new work. `dropdown-menu` is for a list of choices; `popover` is for a panel with its own contents, where the arrow keys belong to what is inside it. A `switch` means "on, immediately"; a `checkbox` means "include in a set, on submit" — that is why both exist. `tabs` is only for a control that swaps panels, not for a segmented filter over one list. For avatars there is exactly one component — `PubkeyAvatar` — and it is the only place allowed to slice a pubkey (the truncation guard allowlists that single line by **line number**, so moving it means updating `web/scripts/check-pubkey-truncation.mjs`). For form controls, `shared/ui/field-row.tsx` carries the app's field language: `Field`/`FieldShell` for a bordered text field, `ValueRow` for the label-left/value-right choice row. Reach for those before adding a native `<select>`.
8. **No exit animations on a Radix panel** — Radix keeps a closing `DropdownMenu` / `ContextMenu` / `Popover` mounted until its CSS exit animation reports `animationend`. When the action behind the item the reader just selected re-renders the tree — which is the whole point of the item — the animation is interrupted, `animationend` never fires, and the panel plus its dismissable layer are **never unmounted**. The stale layer then treats the next open as an outside click and closes it immediately, so the control works exactly once and nothing in the DOM looks wrong. The three primitives therefore carry `animate-in` only; do not add `data-[state=closed]:animate-out` back. Entry animations are safe — nothing waits on them to unmount anything.

---

## Web Client

The web client is React 19 + Vite + Tailwind CSS, under `web/`. Features are
organized under `web/src/features/`. Biome handles linting and formatting.

```bash
just web         # dev server (port derived from the worktree)
just relay-web   # relay serving the built web bundle
```

### The palette is computed at runtime, not written in CSS

**Do not read `web/src/shared/styles/globals.css` to learn the app's colors.**
The palette there is the pre-hydration fallback. What actually paints is derived
in JS from the selected syntax theme:

- `shared/theme/theme-loader.ts` — loads a **Shiki theme JSON** (the `shiki`
  dependency) and pulls out bg / fg / comment / git colors. 62 themes, each its
  own lazy chunk. `nuxx` / `nuxx-dark` are aliases that borrow the GitHub Light /
  GitHub Dark palettes.
- `shared/theme/adaptive-theme.ts` — derives the whole variable set from those
  four colors, including `--background`, `--foreground`, `--card`, `--border`,
  `--muted`, `--popover` and the sidebar tokens.
- `shared/theme/ThemeProvider.tsx` — writes them onto `:root` as inline custom
  properties, which beat everything in the stylesheet. Caches the last palette in
  `localStorage` so a reload does not flash.
- `shared/theme/accent.ts` — the one color that is *chosen* rather than derived
  (primary buttons, active nav row). `nuxx` / `nuxx-dark` pin it to the theme
  foreground; every other theme uses the reader's pick.

So a component must consume semantic tokens (`bg-background`, `text-foreground`,
`border-border`). **A hardcoded hex or a raw Tailwind color (`bg-zinc-900`) does
not follow the theme and will be wrong under 61 of the 62.**

The Nuxx themes add a gradient canvas with a rounded content card floating on
it, via `data-nuxx-sidebar` on `<html>` plus `GradientLayer` / `ContentSurface`
in `shared/theme/ThemeSurfaces.tsx`. The gradient layer sits at `-z-10`, so the
shell root must stay `isolate` — without a stacking context it paints behind its
own background and vanishes while still reporting `opacity: 1`.

**Adding a token means adding its consumer in the same change.** Several
`--nuxx-*` tokens were once copied over without the rules that read them and sat
dead for months, which is why the client rendered in the fallback palette.

### Text sizing & zoom (use rem, never px)

Browser zoom scales the root `<html>` font-size, so **only rem-based text
scales — hardcoded px text sizes are frozen.**

So for any readable text, reach for rem-based Tailwind tokens, never arbitrary
px:

- ✅ Stock rem tokens (`text-base`, `text-sm`, `text-xs`, …). **Chat body/author
  text === `text-base` (16px) — chat is the app's base type size**, and the
  surrounding timeline elements (timestamps, system rows, code, reactions) are
  deliberate steps on that same stock ramp.
- ✅ The named sub-`text-xs` tokens in `web/tailwind.config.js` under
  `theme.extend.fontSize` — `text-2xs` (0.6875rem / 11px), `text-3xs`
  (0.5rem / 8px), and the purpose-named `badge`, `title`, `nsec-key` entries.
  Keep meta text on these tokens, not new arbitrary values.
- ❌ `text-[15px]`, `text-[13px]`, CSS `font-size: 15px` — px freezes against
  zoom.
- ❌ Arbitrary rem literals too: `text-[0.6875rem]`, `text-[0.9rem]`, etc. They
  zoom fine but re-fragment the scale. Use a named token.

Prefer stock tokens — they're rem and zoom-safe. Only if a design genuinely
needs a size the scale can't express should you **add a rem-based token** (in
`web/tailwind.config.js` under `theme.extend.fontSize`) rather than an arbitrary
literal. A CI guard (`pnpm -C web check:px-text`, in
`web/scripts/check-px-text.mjs`) scans all of `web/src` and fails on any new
arbitrary text-size literal — px **or** rem/em.

---

## Mobile App (Flutter)

The mobile app lives in `mobile/` — a Flutter app using Riverpod + Hooks.

### Architecture

- **State management:** Riverpod + `flutter_hooks` (`HookConsumerWidget`)
- **Theme:** Catppuccin Latte (light) / Macchiato (dark). This no longer matches
  web, which derives its palette from a selectable Shiki theme and defaults to
  the branded `nuxx` pair — see the web client's theme section above.
- **Features:** Isolated under `lib/features/`, shared code in `lib/shared/`
- **Nostr models:** `lib/shared/relay/nostr_models.dart` — event kinds must
  stay in sync with `web/src/shared/constants/kinds.ts`

### Rules

- **NEVER use `StatefulWidget`** — favor Riverpod for state and always use
  `HookConsumerWidget` or `ConsumerWidget` with `flutter_hooks` for local state.
- **NEVER run `flutter run`, `flutter build`, `flutter clean`, or
  `flutter upgrade`** — only `flutter test`, `flutter analyze`, and
  `dart format` are safe for agents to run.
- **Do NOT use `print()`** — use `debugPrint()` or structured logging.
- Prefer `context.colors` and `context.textTheme` (via theme extensions)
  over raw `Theme.of(context)` calls.
- **Keep widgets small and composable.** One public widget per file; push
  private sub-widgets (`_Foo`) into sibling `part` files under a
  `<page>/` folder rather than growing the page file. Hard ceiling:
  **1000 lines/file**, enforced by `mobile/scripts/check-file-sizes.mjs` via
  `just mobile-check` (runs in `just check` + pre-push, mirroring web).
  If the guard trips, **split the file — never bump the limit or add an
  override to slip under it.**
- Feature modules must not import from other feature modules — only from
  `shared/`.
- Use `Grid` tokens for spacing, `Radii` for border radius.

### Quality Checks

```bash
cd mobile
dart format --output=none --set-exit-if-changed .
flutter analyze
flutter test
```

Or from repo root: `just mobile-fmt` (auto-fix), `just mobile-check` (lint + fmt check), `just mobile-test` (tests).

To run the app locally (starts Docker, relay, iOS simulator automatically):

```bash
just mobile-dev
```

When run from a git worktree, `just mobile-dev` (and `just
mobile-build-android`) give the debug build a per-worktree app identifier
(keyed to the worktree directory name) and a branch-labelled app name via
`scripts/mobile-worktree-overrides.sh`, so builds from multiple worktrees
install side by side. Release builds are unaffected. `just mobile-clean`
removes stale worktree-suffixed installs from simulators/emulators. See
[mobile/README.md](mobile/README.md) for direct Xcode / Android Studio
usage.

### Testing Conventions

- Prefer **widget tests** over unit tests for UI components — test the
  whole widget tree, not individual methods.
- Use `ProviderScope(overrides: [...])` to inject fake notifiers.
- Fake notifiers should extend the real notifier class and override `build()`.
- Use the `WidgetHelpers.testable()` wrapper for simple widget tests or
  build a custom `ProviderScope` + `MaterialApp` when you need specific overrides.

---

## See Also

- [CONTRIBUTING.md](CONTRIBUTING.md) — setup, code style, PR process, how to add event kinds / CLI subcommands / HTTP endpoints
- [TESTING.md](TESTING.md) — multi-agent E2E test guide
- [ARCHITECTURE.md](ARCHITECTURE.md) — system design and component relationships
- [RELEASING.md](RELEASING.md) — release process: `release-relay`, `scripts/mobile-release.sh`, candidate tags, internal builds
- [README.md](README.md) — project overview and quick start
