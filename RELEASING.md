# Releasing Buzz

Buzz has two independent release lanes. The relay uses a release PR; mobile uses
immutable release-candidate tags cut directly from remote `main`:

| Lane | Entry point | Artifact |
|------|-------------|----------|
| Relay | `just release-relay` | `ghcr.io/tkrnkym/nuxx` container image |
| Mobile | `scripts/mobile-release.sh candidate X.Y.Z` | Exact `mobile-vX.Y.Z-rc.N` source identity |

The lanes version independently: the relay reads its crate manifest, and mobile
derives both source and marketing version from the exact candidate tag.

The desktop lane is gone with the desktop client. `just release-desktop`,
`just bump-desktop-version`, the `version-bump/<v>` branch prefix, the bare
`v<semver>` tag, and `.github/workflows/release.yml` were all removed; only
`relay-v*` and the chart tags still publish anything.

## Quick Start

```sh
# Relay release
just release-relay
just release-relay 0.4.0

# Publish the next mobile candidate from the exact current remote main commit
scripts/mobile-release.sh candidate 0.5.0
```

The relay release uses a metadata PR. Mobile does not. Each
`mobile-vX.Y.Z-rc.N` tag is an immutable candidate and the artifact of record.
There is no mobile release branch, stable mobile tag alias, finalization step,
or mobile GitHub Release.

---

## How It Works

### Relay

1. **`just release-relay`** runs locally on `main`, creates or updates a
   `relay-release/<version>` PR, bumps `crates/nuxx-relay/Cargo.toml`,
   regenerates `Cargo.lock`, and updates the relay changelog.
2. **Merge the PR.** `auto-tag-on-release-pr-merge` pushes
   `relay-v<version>`.
3. **The tag triggers `docker.yml`.** Stable releases update the version
   aliases and `latest`; prereleases do not. Each release also publishes an
   optimized, symbol-bearing image under matching `debug-` tags (for example,
   `debug-0.3.0` and `debug-latest`) for native profiling. The ordinary tags
   remain stripped and are the default for deployments that do not need it.

Every push to `main` continues to publish the rolling relay `:main` and
`:sha-<7>` tags, plus matching `:debug-main` and `:debug-sha-<7>` variants.

### Mobile

1. **Publish a candidate.** From a clean checkout whose `origin` is the
   canonical `tkrnkym/buzz` repository, run
   `scripts/mobile-release.sh candidate X.Y.Z`. The script resolves and fetches
   the exact current `origin/main` commit, derives the next number from exact
   remote tags for that marketing version, and publishes an annotated
   `mobile-vX.Y.Z-rc.N` tag there through the dedicated `buzz-release-bot`
   GitHub App. It never uses the operator's checked-out commit and never moves
   an existing candidate.
2. **Build the exact tag.** Enter the candidate tag as `mobile_ref` in the
   private Buzz mobile Buildkite pipeline. OSS CI deliberately cannot trigger
   that private pipeline. The tag supplies both source commit and release
   version. Flutter receives clean marketing version `X.Y.Z`; Buildkite's
   monotonically increasing build number supplies the platform build number.
3. **Promote tested artifacts.** Promote the already-built signed artifact for
   each platform through its store workflow. Record the exact tag with the
   build or rollout record. No source ref is changed and no final build is cut.

The iOS and Android artifacts for one marketing version may come from different
RC tags. For example, iOS can ship `mobile-v0.5.0-rc.2` while Android ships
`mobile-v0.5.0-rc.3`. Each platform's exact candidate tag is its source record.
There is intentionally no single selected or final candidate for the marketing
version.

The simplification trades away a separate stabilization line. Unrelated commits
that reach `main` become part of every later candidate, and there is no retained
hotfix branch or branch-ancestry history. Add a dedicated hotfix flow later if a
release actually needs isolation from `main`.

`mobile/pubspec.yaml` keeps `0.0.0+1` only as a valid, visibly non-release
fallback for local development and validation builds. Release jobs always
inject both version fields. `mobile/CHANGELOG.md` is retained as historical
release data. It is not a release ledger for this flow.

---

## Version Sources

| Lane | Release version authority |
|------|---------------------------|
| Relay | `crates/nuxx-relay/Cargo.toml` |
| Mobile | Exact `mobile-vX.Y.Z-rc.N` remote tag |

`just bump-relay-version <version>` updates the
relay crate and regenerates `Cargo.lock`. Mobile has no bump recipe or
release-metadata PR.

---

## Manual Release Retry

The **Release** workflow's manual dispatch is only a retry mechanism for an
existing immutable `v<version>` tag. Select that tag in the ref picker and
provide the matching semver version without the `v` prefix. It cannot build
from `main` or another caller-selected source ref.

Mobile intentionally has no branch or arbitrary-ref fallback. The private
Buildkite pipeline accepts only an exact candidate tag.

---

## Internal Releases

For mobile, trigger the private
[Release Mobile pipeline](https://buildkite.com/runway/buzz-mobile-releases) with
an exact RC tag for the platform build being cut.

That pipeline lives in a Block-internal repository this fork cannot reach, so the
mobile handoff is not runnable here — the candidate tag is still the artifact of
record, but publishing to a store needs a pipeline you own.

---

## What Gets Published

Mobile publishes only annotated `mobile-vX.Y.Z-rc.N` git tags. Store artifacts
and rollout records retain the exact tag they used. Mobile does not publish a
GitHub Release or a stable `mobile-vX.Y.Z` alias.

---

## Prerequisites

- **Write access** to the `tkrnkym/buzz` GitHub repository
- An `origin` remote whose configured URL is the canonical `tkrnkym/buzz`
  repository
- `gh` CLI version 2.87.0 or newer, authenticated with permission to dispatch
  the candidate workflow
- Release tag ruleset [`14378754`](https://github.com/tkrnkym/buzz/rules/14378754)
  active for `mobile-v*`, with creation, update, deletion, and non-fast-forward
  protections and `buzz-release-bot` as its sole always-bypass actor
- The `buzz-release-bot` App credentials configured for GitHub Actions

Mobile candidate publication requires workflow-dispatch access and the existing
release App because strict tag protection denies direct human creation. The App
must be installed on `tkrnkym/buzz`, have Contents write and Metadata read, and
retain an `always` bypass on the immutable `mobile-v*` tag rules. It does not
require GitHub Releases permissions, repository Administration permission, or a
mobile release-branch ruleset. The publisher validates the App token's effective
`current_user_can_bypass` value rather than reading the ruleset's hidden bypass
actor list.

---

## Troubleshooting

### New commits land after publishing a mobile candidate

Run `scripts/mobile-release.sh candidate <version>` again after the intended
fix reaches remote `main`. It publishes a new immutable RC tag at the new exact
remote commit. Continue referring to each tested or shipped platform artifact by
its own exact tag.

### `scripts/mobile-release.sh candidate` fails because `main` moved during publication

The App-backed workflow may already have published the requested immutable RC
at the prior `main` tip before the operator command detects the race. Do not
move or delete that tag, and do not treat it as the candidate for current
`main`. Inspect the run URL from the command output, then rerun
`scripts/mobile-release.sh candidate <version>` to publish the next RC from the
new current `main` tip.

### A mobile candidate command selects the wrong RC number

Do not retry by moving or deleting a tag. Inspect the exact remote `mobile-v*`
tags and resolve the unexpected state. Candidate numbers are monotonically
increasing remote identities.

### A mobile candidate publication is rejected by repository rules

Confirm `buzz-release-bot` remains the sole always-bypass actor for the active
`mobile-v*` ruleset and that its Actions credentials are available. Do not grant
direct human creation or weaken update or deletion protection. Existing
candidate tags must remain immutable.
