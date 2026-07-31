#!/usr/bin/env bash
# Computes the per-worktree dev environment for the web client.
# Source this file from dev commands; it exports:
#   NUXX_VITE_PORT, NUXX_HMR_PORT, VITE_PORT, VITE_HMR_PORT
#   NUXX_RELAY_PORT, NUXX_RELAY_URL
#   NUXX_INSTANCE_SLUG, NUXX_WORKTREE_LABEL, VITE_DEV_BRANCH (worktrees only)

WORKTREE_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)

# Derive a stable base port from the worktree root so the same worktree always
# gets the same ports, and two worktrees never contend for one port.
BASE_PORT=$(python3 -c "import hashlib,sys; h=int(hashlib.sha256(sys.argv[1].encode()).hexdigest(), 16); print(10000 + h % 55000)" "$WORKTREE_ROOT")
export NUXX_VITE_PORT=$BASE_PORT
export NUXX_HMR_PORT=$((BASE_PORT + 1))
export NUXX_RELAY_PORT=3000
export VITE_PORT="$NUXX_VITE_PORT"
export VITE_HMR_PORT="$NUXX_HMR_PORT"
export NUXX_RELAY_URL="${NUXX_RELAY_URL:-ws://localhost:3000}"

unset VITE_DEV_BRANCH

# In worktrees, label the dev server with the branch so concurrent instances are
# distinguishable in the browser.
#
# Worktree detection: compare --git-dir to --git-common-dir. In the main
# working tree these are identical; in any worktree (whether under .worktrees/,
# .claude/worktrees/, or elsewhere on disk) they differ.
if git rev-parse --is-inside-work-tree &>/dev/null; then
    GIT_DIR=$(git rev-parse --git-dir)
    GIT_COMMON_DIR=$(git rev-parse --git-common-dir 2>/dev/null)
    if [[ -n "$GIT_COMMON_DIR" && "$GIT_DIR" != "$GIT_COMMON_DIR" ]]; then
        BRANCH_NAME=$(git rev-parse --abbrev-ref HEAD)
        export NUXX_WORKTREE_LABEL="${BRANCH_NAME##*/}"
        export NUXX_INSTANCE_SLUG=$(echo "$BRANCH_NAME" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g' | sed 's/^-//' | sed 's/-$//')
        echo "🌳 Worktree: ${NUXX_WORKTREE_LABEL}"
        export VITE_DEV_BRANCH="$NUXX_WORKTREE_LABEL"
    fi
fi
