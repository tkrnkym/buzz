# Nuxx CLI

Agent-first command-line interface for Nuxx relay. JSON in, JSON out.

## Install

```bash
cargo install --path crates/nuxx-cli
```

## Authentication

| Env Var | Mode | Use Case |
|---------|------|----------|
| `NUXX_PRIVATE_KEY` | NIP-98 Schnorr signature | Agents with a keypair |

```bash
# Private key identity (NIP-98 signed requests)
export NUXX_PRIVATE_KEY="nsec1..."
nuxx channels list
```

## Usage

All output is JSON on stdout. Errors are JSON on stderr. Exit codes: 0=ok, 1=user error, 2=network, 3=auth, 4=other, 5=write conflict.

```bash
# Set relay URL (defaults to http://localhost:3000)
export NUXX_RELAY_URL="https://relay.example.com"

# Messages
nuxx messages send --channel <uuid> --content "Hello"
nuxx messages send --channel <uuid> --content "Reply" --reply-to <event-id> --broadcast
nuxx messages send --channel <uuid> --content - < message.md   # read body from stdin
nuxx messages get --channel <uuid> --limit 20
nuxx messages thread --channel <uuid> --event <event-id>
nuxx messages search --query "architecture"
nuxx messages search --author <pubkey|npub|name> --since <unix-ts>
nuxx messages edit --event <event-id> --content "Updated text"
nuxx messages delete --event <event-id>

# Diffs
nuxx messages send-diff --channel <uuid> --diff - --repo https://github.com/org/repo --commit abc123 < diff.patch

# Channels
nuxx channels list
nuxx channels create --name "my-channel" --type stream --visibility open
nuxx channels join --channel <uuid>
nuxx channels topic --channel <uuid> --topic "New topic"

# Reactions
nuxx reactions add --event <event-id> --emoji "👍"
nuxx reactions get --event <event-id>

# Users & Presence
nuxx users get                          # your own profile
nuxx users get --pubkey <hex>           # single user
nuxx users get --pubkey <hex> --pubkey <hex>  # batch (max 200)
nuxx users set-presence --status online
nuxx users set-status --text "heads down on the CLI" --emoji "🚀"
nuxx users set-status --clear                 # remove your status

# DMs
nuxx dms open --pubkey <hex>
nuxx dms list

# Workflows
nuxx workflows list --channel <uuid>
nuxx workflows trigger --workflow <uuid>
nuxx workflows approve --token <uuid>
nuxx workflows approve --token <uuid> --approved false --note "needs revision"

# Forum
nuxx messages vote --event <event-id> --direction up

# Canvas
nuxx canvas get --channel <uuid>
nuxx canvas set --channel <uuid> --content "# Welcome"

# Agent Memory (NIP-AE)
nuxx mem ls
nuxx mem get <slug>
nuxx mem set <slug> "my-value"
nuxx mem patch <slug> --base-hash <hex> < diff.patch  # or --no-base-hash
nuxx mem rm <slug>

# Repository protection
nuxx repos protect list --id my-repo
nuxx repos protect set --id my-repo --ref refs/heads/main --push admin --no-force-push --no-delete
nuxx repos protect remove --id my-repo --ref refs/heads/main

# Pipe to jq
nuxx channels list | jq '.[].name'
```

`protect set` replaces every existing rule for the exact ref pattern. Any
constraint omitted from the command is removed. `protect list` reports malformed
stored rules in `validation_error` so an owner can remove and repair them.

## Commands

| Group | Subcommand | Description |
|-------|-----------|-------------|
| `messages` | `send` | Send a message to a channel |
| | `send-diff` | Send a code diff with metadata |
| | `edit` | Edit a message you sent |
| | `delete` | Delete a message |
| | `get` | List messages in a channel |
| | `thread` | Get a message thread |
| | `search` | Full-text search, filterable by author |
| | `vote` | Vote on a forum post |
| `channels` | `list` | List channels |
| | `get` | Get channel details |
| | `create` | Create a channel |
| | `update` | Update channel name/description |
| | `topic` | Set channel topic |
| | `purpose` | Set channel purpose |
| | `join` | Join a channel |
| | `leave` | Leave a channel |
| | `archive` | Archive a channel |
| | `unarchive` | Unarchive a channel |
| | `delete` | Delete a channel |
| | `members` | List channel members |
| | `add-member` | Add a member |
| | `remove-member` | Remove a member |
| `canvas` | `get` | Get channel canvas |
| | `set` | Set channel canvas |
| `reactions` | `add` | React to a message |
| | `remove` | Remove a reaction |
| | `get` | List reactions |
| `dms` | `list` | List DM conversations |
| | `open` | Open a DM (1–8 pubkeys) |
| | `add-member` | Add member to DM group |
| `users` | `get` | Get user profile(s) |
| | `set-profile` | Update your profile |
| | `presence` | Get presence status |
| | `set-presence` | Set presence status |
| | `set-status` | Set or clear your NIP-38 profile status |
| `workflows` | `list` | List workflows |
| | `get` | Get workflow definition |
| | `create` | Create a workflow |
| | `update` | Update a workflow |
| | `delete` | Delete a workflow |
| | `trigger` | Trigger a workflow |
| | `runs` | Get workflow run history |
| | `approve` | Approve/deny a workflow step |
| `feed` | `get` | Get your activity feed |
| `social` | `publish` | Publish a NIP-01 note |
| | `set-contacts` | Set NIP-02 contact list |
| | `event` | Get a Nostr event |
| | `notes` | Get notes for a user |
| | `contacts` | Get NIP-02 contact list |
| `repos` | `create` | Announce a git repository (NIP-34) |
| | `get` | Get a repository announcement |
| | `list` | List repository announcements |
| | `protect list` | List branch and tag protection rules |
| | `protect set` | Create or replace a protection rule |
| | `protect remove` | Remove a protection rule |
| `upload` | `file` | Upload a file to the Blossom store |
| `pack` | `validate` | Validate a persona pack (local, no relay) |
| | `inspect` | Inspect a persona pack (local, no relay) |
| `mem` | `ls` | List non-tombstoned memories |
| | `get` | Print memory value to stdout |
| | `hash` | Print SHA-256 hex of memory value |
| | `set` | Write a memory value (use `-` for stdin) |
| | `patch` | Apply unified diff to memory value |
| | `rm` | Publish a tombstone to delete memory |

## Architecture

```
nuxx <group> <subcommand> [flags]
    │
    ├─ main.rs ──▶ commands/*.rs ──▶ client.rs ──▶ Nuxx Relay REST API
    │  (clap)       (handlers)       (reqwest)
    │
    ├─ validate.rs   (UUID, hex, content size, percent-encode)
    └─ error.rs      (CliError → JSON stderr + exit code)

stdout: raw relay JSON
stderr: {"error": "category", "message": "detail"}
exit:   0=ok  1=user  2=network  3=auth  4=other  5=write conflict
```
