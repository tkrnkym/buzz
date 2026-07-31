# Nuxx — development task runner

set dotenv-load := true

web_dir := "web"

# List all available tasks
default:
    @just --list

# ─── Dev Environment ─────────────────────────────────────────────────────────

# Install required dev tools via Hermit and create .env (safe to re-run)
bootstrap:
    #!/usr/bin/env bash
    set -euo pipefail
    export PATH="{{justfile_directory()}}/bin:$PATH"
    # Hermit's bin/ symlinks auto-download pinned tool versions on first use.
    # Running each tool once triggers the download if not already cached.
    echo "Ensuring toolchain via Hermit..."
    cargo --version &
    node --version &
    pnpm --version &
    wait
    if ! command -v docker &>/dev/null; then
        echo "Error: Docker is required but not installed."
        echo "Install it from https://docs.docker.com/get-docker/"
        exit 1
    fi
    if [[ ! -f .env ]]; then
        cp .env.example .env
        echo "Created .env from .env.example — review it before running just relay."
    fi

# Start Docker services, run migrations, install JS deps
setup: bootstrap
    ./scripts/dev-setup.sh

# Install git hooks via lefthook (dispatches from the shared .git/hooks dir so all
# linked worktrees inherit the same hooks without a worktree-relative .hooks path)
hooks:
    #!/usr/bin/env bash
    set -euo pipefail
    # Use the Hermit-pinned lefthook (bin/lefthook self-downloads on first use):
    # works with no pre-installed lefthook and guarantees the pinned version
    # rather than whatever happens to be on PATH.
    export PATH="{{justfile_directory()}}/bin:$PATH"
    # --path-format=absolute guarantees an absolute path from every invocation context:
    # without it, --git-common-dir returns ".git" from the main checkout and a
    # relative hooksPath would break linked-worktree dispatch just like .hooks did.
    HOOKS_DIR="$(git rev-parse --path-format=absolute --git-common-dir)/hooks"
    git config --local core.hooksPath "$HOOKS_DIR"
    lefthook install --force

# Wipe development state and recreate a clean environment.
[confirm("This will DELETE all development data. Continue? (y/N)")]
reset:
    ./scripts/dev-reset.sh --yes

# Stop all dev services (keep data)
down:
    docker compose down

# Show dev service status
ps:
    docker compose ps

# Tail all service logs
logs *ARGS:
    docker compose logs -f {{ARGS}}

# ─── Build & Check ───────────────────────────────────────────────────────────

# Build the Rust workspace
build:
    cargo build --workspace

# Build the Rust workspace in release mode
build-release:
    cargo build --workspace --release

# Run repo lint and formatting checks
check: fmt-check clippy web-check mobile-check

# Format all Rust code
fmt:
    cargo fmt --all

# Check formatting without modifying files
fmt-check:
    cargo fmt --all -- --check

# Run clippy with warnings as errors
clippy:
    cargo clippy --workspace --all-targets -- -D warnings

# Install JS dependencies (pnpm workspace — installs all packages from root)
js-install:
    pnpm install

# Install JS dependencies reproducibly for CI (pnpm workspace)
js-install-ci:
    pnpm install --frozen-lockfile

# Ensure Docker dev services (Postgres, Redis, etc.) are running and healthy
_ensure-services:
    #!/usr/bin/env bash
    set -euo pipefail
    pg=$(docker inspect --format '{{"{{"}}.State.Health.Status{{"}}"}}' nuxx-postgres 2>/dev/null || echo "not_found")
    redis=$(docker inspect --format '{{"{{"}}.State.Health.Status{{"}}"}}' nuxx-redis 2>/dev/null || echo "not_found")
    if [[ "$pg" == "healthy" && "$redis" == "healthy" ]]; then
        echo "Services already healthy"
        exit 0
    fi
    echo "Starting services..."
    docker compose up -d || true
    echo -n "Waiting for services"
    for i in $(seq 1 40); do
        pg=$(docker inspect --format '{{"{{"}}.State.Health.Status{{"}}"}}' nuxx-postgres 2>/dev/null || echo "not_found")
        redis=$(docker inspect --format '{{"{{"}}.State.Health.Status{{"}}"}}' nuxx-redis 2>/dev/null || echo "not_found")
        if [[ "$pg" == "healthy" && "$redis" == "healthy" ]]; then
            echo " ready"
            exit 0
        fi
        echo -n "."
        sleep 3
    done
    echo " timed out"
    exit 1

# Apply database migrations and seed the local dev community if the dev database is running
_ensure-migrations: _ensure-services
    cargo run -p nuxx-admin -- migrate
    ./scripts/seed-local-community.sh

# Run all checks suitable for CI / pre-push (no infra needed)
ci: check test-unit web-test web-build mobile-test

# ─── Test ─────────────────────────────────────────────────────────────────────

# Run all tests (unit + integration)
test:
    ./scripts/run-tests.sh all

# Run unit tests only (no infra needed)
test-unit:
    #!/usr/bin/env bash
    if command -v cargo-nextest &>/dev/null; then
        cargo nextest run -p nuxx-core -p nuxx-auth --lib
        # nuxx-db migrator/lint tests: pure SQL-parsing unit tests (no infra).
        # They guard the embedded-migrator invariant (exactly the consolidated
        # 0001; cutover/backfill stays an operator script, not startup state)
        # and the tenant-scoping lints. The Postgres-backed nuxx-db tests are
        # #[ignore]d, so --lib runs only the infra-free set. Without this gate a
        # stray file in migrations/ or a broken lint ships green.
        cargo nextest run -p nuxx-db --lib
        # Multi-tenant conformance gate (nuxx-conformance): the independent
        # replay checker + golden fixtures. No infra — pure in-process trace
        # replay — so it belongs in the unit job. Run all targets (lib + the
        # tests/replay_fixtures.rs integration test), not just --lib.
        cargo nextest run -p nuxx-conformance
        # Gateway unit and black-box HTTP tests are infra-free. Postgres-backed
        # contract/race tests run in the dedicated CI job below.
        cargo nextest run -p nuxx-push-gateway
    else
        ./scripts/run-tests.sh unit
    fi

# Run integration tests only (starts services if needed)
test-integration:
    ./scripts/run-tests.sh integration

# ─── Run ──────────────────────────────────────────────────────────────────────

# Start the relay server (auto-starts Docker services if needed)
relay: bootstrap _ensure-migrations
    #!/usr/bin/env bash
    set -euo pipefail
    export PATH="{{justfile_directory()}}/bin:$PATH"
    cargo run -p nuxx-relay

# Start the relay with the built web UI served from it
relay-web: bootstrap _ensure-migrations
    #!/usr/bin/env bash
    set -euo pipefail
    export PATH="{{justfile_directory()}}/bin:$PATH"
    [[ -d node_modules ]] || pnpm install
    pnpm -C web build
    NUXX_WEB_DIR=./web/dist cargo run -p nuxx-relay

# Build and run the private read-only admin dashboard
admin: bootstrap _ensure-migrations
    #!/usr/bin/env bash
    set -euo pipefail
    export PATH="{{justfile_directory()}}/bin:$PATH"
    [[ -d node_modules ]] || pnpm install
    pnpm -C admin-web build
    export NUXX_ADMIN_HOST="${NUXX_ADMIN_HOST:-admin.localhost:3000}"
    export NUXX_ADMIN_WEB_DIR="${NUXX_ADMIN_WEB_DIR:-{{justfile_directory()}}/admin-web/dist}"
    echo "Admin dashboard: http://${NUXX_ADMIN_HOST}/reports"
    cargo run -p nuxx-relay

# Seed deterministic reports and product feedback for local admin dashboard review
admin-seed: _ensure-migrations
    ./scripts/seed-admin-dashboard.sh

# Run focused relay and browser checks for the read-only admin dashboard
admin-check: fmt-check
    cargo check -p nuxx-relay --all-targets
    cargo test -p nuxx-relay api::admin
    cargo test -p nuxx-relay router::tests
    pnpm -C admin-web check
    pnpm -C admin-web exec playwright test

# Start the relay server in release mode
relay-release: _ensure-migrations
    cargo run -p nuxx-relay --release


# ─── Web ─────────────────────────────────────────────────────────────────────

# Run the web frontend dev server (port derived from worktree to avoid collisions)
web:
    #!/usr/bin/env bash
    set -euo pipefail
    [[ -d node_modules ]] || pnpm install
    source scripts/instance-env.sh
    export VITE_PORT=$((NUXX_VITE_PORT + 100))
    export VITE_RELAY_URL="${NUXX_RELAY_URL}"
    echo "Starting web dev server on port ${VITE_PORT}, relay ${NUXX_RELAY_URL}"
    cd {{web_dir}}
    pnpm exec vite --port "${VITE_PORT}" --strictPort

# Run web lint and format checks
web-check:
    cd {{web_dir}} && pnpm check

# Fix web lint and format issues
web-fix:
    cd {{web_dir}} && pnpm exec biome check --write . && pnpm check:file-sizes

# Run web TypeScript checks
web-typecheck:
    cd {{web_dir}} && pnpm typecheck

# Run web unit tests
web-test:
    cd {{web_dir}} && pnpm test

# Build web frontend assets
web-build:
    cd {{web_dir}} && pnpm build

# Run web browser smoke tests
web-e2e-smoke:
    cd {{web_dir}} && pnpm test:e2e:smoke

# ─── Mobile ──────────────────────────────────────────────────────────────────

mobile_dir := "mobile"

# Install mobile Flutter dependencies
mobile-install:
    unset GIT_DIR GIT_WORK_TREE; cd {{mobile_dir}} && flutter pub get

# Format all Dart code
mobile-fmt:
    unset GIT_DIR GIT_WORK_TREE; cd {{mobile_dir}} && dart format .

# Fix mobile formatting and run analysis
mobile-fix:
    unset GIT_DIR GIT_WORK_TREE; cd {{mobile_dir}} && dart format . && flutter analyze

# Run mobile lint and format checks
mobile-check:
    unset GIT_DIR GIT_WORK_TREE; cd {{mobile_dir}} && dart format --output=none --set-exit-if-changed . && flutter analyze && node ./scripts/check-file-sizes.mjs

# Run mobile tests
mobile-test:
    unset GIT_DIR GIT_WORK_TREE; cd {{mobile_dir}} && flutter test

# Compile an unsigned Android debug APK (worktree-aware debug identity)
mobile-build-android:
    ./scripts/mobile-worktree-overrides.sh
    unset GIT_DIR GIT_WORK_TREE; cd {{mobile_dir}} && flutter build apk --debug --no-pub

# Run the mobile app on iOS simulator (worktree-aware debug identity)
mobile-dev:
    #!/usr/bin/env bash
    set -euo pipefail
    if ! pgrep -x Simulator &>/dev/null; then
        open -a Simulator
        sleep 3
    fi
    ./scripts/mobile-worktree-overrides.sh
    cd {{mobile_dir}}
    unset GIT_DIR GIT_WORK_TREE
    flutter run

# Uninstall stale worktree-suffixed Nuxx debug installs (production apps kept)
mobile-clean:
    ./scripts/mobile-worktree-clean.sh

# ─── Database ─────────────────────────────────────────────────────────────────

# Apply database migrations
migrate: _ensure-migrations

# ─── Utilities ────────────────────────────────────────────────────────────────

# Remove build artifacts
clean:
    cargo clean

# Check the Rust workspace compiles without producing binaries
check-compile:
    cargo check --workspace --all-targets

# ─── Release ─────────────────────────────────────────────────────────────────

# Read the current relay version from its crate manifest
get-current-relay-version:
    @grep -m1 '^version = ' crates/nuxx-relay/Cargo.toml | sed -E 's/version = "(.*)"/\1/'

# Compute next relay patch version (e.g., 0.3.0 → 0.3.1)
get-next-relay-patch-version:
    @python3 -c "v='$(just get-current-relay-version)'.split('.'); print(f'{v[0]}.{v[1]}.{int(v[2])+1}')"

# Bump the relay crate version and regenerate the lockfile
bump-relay-version version:
    #!/usr/bin/env bash
    set -euo pipefail
    # nuxx-relay carries its own `version =` (not version.workspace), so the
    # replace targets the package version line only.
    perl -i -pe 's/^version = ".*"/version = "{{ version }}"/' crates/nuxx-relay/Cargo.toml
    cargo update -p nuxx-relay
    echo "Bumped nuxx-relay to {{ version }} and regenerated Cargo.lock"

# Open or update the relay release PR (ghcr.io/tkrnkym/nuxx image)
release-relay *ARGS:
    #!/usr/bin/env bash
    set -euo pipefail
    ARG="{{ ARGS }}"
    if [[ -z "$ARG" || "$ARG" == "patch" ]]; then
        VERSION=$(just get-next-relay-patch-version)
    else
        VERSION="$ARG"
    fi
    just _release-pr relay "$VERSION"

# Release-PR engine for the relay. Mobile publishes immutable candidate tags
# directly from remote main instead of using metadata-only PRs.
_release-pr lane version:
    #!/usr/bin/env bash
    set -euo pipefail
    VERSION="{{ version }}"
    if ! echo "$VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$'; then
        echo "Error: '$VERSION' is not valid semver (expected X.Y.Z)"
        exit 1
    fi
    # Lane-specific identifiers. The bump command runs after the branch switch.
    # Relay is the only lane left; the `*)` arm still catches a mistyped one.
    case "{{ lane }}" in
        relay)
            BRANCH_PREFIX="relay-release"
            TAG_FETCH='relay-v*'
            TAG_MATCH='relay-v[0-9]*'
            TAG_EXCLUDE='relay-v*-*'
            TAG_PREFIX="relay-v"
            CHANGELOG="crates/nuxx-relay/CHANGELOG.md"
            ADD_FILES=(crates/nuxx-relay/Cargo.toml Cargo.lock crates/nuxx-relay/CHANGELOG.md)
            LOG_PATHS=(crates/nuxx-relay/ crates/nuxx-core/ crates/nuxx-db/ crates/nuxx-auth/ crates/nuxx-pubsub/ crates/nuxx-search/ crates/nuxx-audit/ crates/nuxx-media/ crates/nuxx-sdk/ crates/nuxx-workflow/ crates/nuxx-conformance/ migrations/)
            ARTIFACT="Nuxx Relay" ;;
        *)
            echo "Error: unknown release lane '{{ lane }}'"
            exit 1 ;;
    esac
    echo "Preparing ${ARTIFACT} release v${VERSION}..."
    # Must run on main with a clean, up-to-date tree.
    CURRENT_BRANCH=$(git symbolic-ref --short HEAD)
    if [[ "$CURRENT_BRANCH" != "main" ]]; then
        echo "Error: must be on main branch (currently on '$CURRENT_BRANCH')"
        exit 1
    fi
    git fetch origin refs/heads/main:refs/remotes/origin/main --no-tags
    # Release tags are remote-owned state; sync only this lane's tags so stale
    # local tags from older histories do not make release preflight fail.
    git fetch origin "+refs/tags/${TAG_FETCH}:refs/tags/${TAG_FETCH}"
    if [[ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]]; then
        echo "Error: local main is not up-to-date with origin/main. Run 'git pull' first."
        exit 1
    fi
    if ! git diff --quiet || ! git diff --cached --quiet; then
        echo "Error: working tree is dirty. Commit or stash changes first."
        exit 1
    fi
    # Switch to the release branch (create, or reset to main if it exists).
    BRANCH="${BRANCH_PREFIX}/${VERSION}"
    if git rev-parse --verify "refs/heads/$BRANCH" >/dev/null 2>&1; then
        echo "Branch '$BRANCH' already exists — resetting to origin/main..."
        git switch "$BRANCH"
        git reset --hard origin/main
    elif git ls-remote --exit-code --heads origin "$BRANCH" >/dev/null 2>&1; then
        echo "Branch '$BRANCH' exists on remote — checking out and resetting to origin/main..."
        git switch -c "$BRANCH" --track "origin/$BRANCH"
        git reset --hard origin/main
    else
        git switch -c "$BRANCH"
    fi
    # Lane-specific bump (the one diverging step).
    case "{{ lane }}" in
        relay) just bump-relay-version "$VERSION" ;;
    esac
    # Generate the changelog from commits since this lane's last release tag.
    LAST_TAG=$(git describe --tags --abbrev=0 --match "$TAG_MATCH" --exclude "$TAG_EXCLUDE" 2>/dev/null || echo "")
    REPO=$(git remote get-url origin | sed -E 's|.*github\.com[:/]||; s|\.git$||')
    format_log() {
        local range="$1"
        git log "$range" --format="%h %H %s" --no-merges -- "${LOG_PATHS[@]}" | while IFS=' ' read -r short full rest; do
            local pr subject
            pr=$(printf '%s' "$rest" | grep -oE '\(#[0-9]+\)$' | grep -oE '[0-9]+' || true)
            if [[ -n "$pr" ]]; then
                subject=$(printf '%s' "$rest" | sed -E 's/ \(#[0-9]+\)$//')
                printf -- '- %s ([#%s](https://github.com/%s/pull/%s)) ([`%s`](https://github.com/%s/commit/%s))\n' \
                    "$subject" "$pr" "$REPO" "$pr" "$short" "$REPO" "$full"
            else
                printf -- '- %s ([`%s`](https://github.com/%s/commit/%s))\n' \
                    "$rest" "$short" "$REPO" "$full"
            fi
        done
    }
    TMPFILE=$(mktemp)
    {
        echo "# Changelog"
        echo ""
        echo "## ${TAG_PREFIX}${VERSION}"
        echo ""
        if [[ -n "$LAST_TAG" ]]; then
            format_log "${LAST_TAG}..HEAD"
        else
            echo "- Initial release"
        fi
        echo ""
        if [[ -f "$CHANGELOG" ]]; then
            tail -n +2 "$CHANGELOG"
        fi
    } > "$TMPFILE"
    mkdir -p "$(dirname "$CHANGELOG")"
    mv "$TMPFILE" "$CHANGELOG"
    # Commit.
    git add "${ADD_FILES[@]}"
    RELEASE_MSG="chore(release): release ${ARTIFACT} version ${VERSION}"
    if [[ "$(git log -1 --format='%s' 2>/dev/null)" == "$RELEASE_MSG" ]]; then
        git commit --amend --no-edit
    else
        git commit -m "$RELEASE_MSG"
    fi
    # Push and open/update the PR.
    git push --force-with-lease -u origin "$BRANCH"
    PR_BODY="## ${ARTIFACT} release v${VERSION}"$'\n\n'
    if [[ -n "$LAST_TAG" ]]; then
        PR_BODY+="### Changes since ${LAST_TAG}:"$'\n\n'
        CHANGELOG_BODY=$(format_log "${LAST_TAG}..HEAD~1")
        MAX_LOG=62000
        if (( ${#CHANGELOG_BODY} > MAX_LOG )); then
            TRUNCATED=$(printf '%s' "$CHANGELOG_BODY" | awk -v max="$MAX_LOG" \
                'BEGIN{n=0} {line_len=length($0)+1; if(n+line_len>max) exit; n+=line_len; print}')
            SHOWN=$(printf '%s\n' "$TRUNCATED" | grep -c '^-' || true)
            TOTAL=$(printf '%s\n' "$CHANGELOG_BODY" | grep -c '^-' || true)
            SKIPPED=$(( TOTAL - SHOWN ))
            CHANGELOG_BODY="${TRUNCATED}"$'\n'"_… and ${SKIPPED} more commits — [compare ${LAST_TAG}…${TAG_PREFIX}${VERSION}](https://github.com/${REPO}/compare/${LAST_TAG}...${TAG_PREFIX}${VERSION})_"
        fi
        PR_BODY+="${CHANGELOG_BODY}"$'\n\n'
    else
        PR_BODY+="Initial release."$'\n\n'
    fi
    PR_BODY+="**To release:** merge this PR. The tag and build will happen automatically."
    PR_TITLE="chore(release): release ${ARTIFACT} version ${VERSION}"
    EXISTING_PR=$(gh pr list --head "$BRANCH" --json url --jq '.[0].url' 2>/dev/null || true)
    if [[ -n "$EXISTING_PR" ]]; then
        gh pr edit "$BRANCH" --title "$PR_TITLE" --body "$PR_BODY"
        PR_URL="$EXISTING_PR"
        echo ""
        echo "Updated existing release PR: ${PR_URL}"
    else
        PR_URL=$(gh pr create --title "$PR_TITLE" --body "$PR_BODY")
        echo ""
        echo "Release PR opened: ${PR_URL}"
    fi
    echo "Merge it to trigger the release build."

# ─── Agent Harness ────────────────────────────────────────────────────────────

# Run a goose agent connected to a Nuxx relay (foreground)
goose relay="ws://localhost:3000" agents="1" heartbeat="0" prompt="" key="$NUXX_PRIVATE_KEY":
    #!/usr/bin/env bash
    set -euo pipefail
    export PATH="{{justfile_directory()}}/bin:$PATH"
    source ./scripts/_goose-env.sh "{{relay}}" "{{key}}" "{{agents}}" "{{heartbeat}}" "{{prompt}}"
    exec env "${env_args[@]}" ./target/release/nuxx-acp

# Run a goose agent in the background (screen session named 'goose-agent-N')
goose-bg relay="ws://localhost:3000" agents="1" heartbeat="0" prompt="" key="$NUXX_PRIVATE_KEY":
    #!/usr/bin/env bash
    set -euo pipefail
    export PATH="{{justfile_directory()}}/bin:$PATH"
    source ./scripts/_goose-env.sh "{{relay}}" "{{key}}" "{{agents}}" "{{heartbeat}}" "{{prompt}}"
    screen -dmS goose-agent-{{agents}} bash -c "$(printf '%q ' env "${env_args[@]}") ./target/release/nuxx-acp"
    echo "Agent running in screen session 'goose-agent-{{agents}}'. Attach with: screen -r goose-agent-{{agents}}"

# ─── Benchmarking ─────────────────────────────────────────────────────────────

# Run the Nuxx orchestra benchmark — leaderboard-eligible by default (TB 2.1, k=5, Sonnet+Haiku). Stands up its own Docker stack; flags pass to benchmark.py (--dataset/--path, --include-task, --attempts, --manifest, --dry-run, ...)
benchmark *ARGS:
    #!/usr/bin/env bash
    set -euo pipefail
    export PATH="{{justfile_directory()}}/bin:$PATH"
    uv run --project benchmarks/harbor-nuxx-orchestra/testbed \
        benchmarks/harbor-nuxx-orchestra/scripts/benchmark.py {{ARGS}}

# Stop the benchmark Docker stack (state and channels are kept)
benchmark-down:
    docker compose --project-name nuxx-benchmark down
