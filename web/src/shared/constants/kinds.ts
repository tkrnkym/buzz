/**
 * Nostr event kinds used by the web client.
 *
 * `crates/nuxx-core/src/kind.rs` is the source of truth. `pnpm check:kinds`
 * asserts every constant here matches its `KIND_*` counterpart there, so a
 * relay-side renumbering cannot silently desynchronize the client.
 *
 * Reminder from the relay contract: every REQ must carry an explicit `kinds`
 * array. An open-ended filter trips the relay's p-gate and comes back 403.
 */

/** NIP-01 profile metadata. Self-asserted: signed by its own subject. */
export const KIND_PROFILE = 0;
export const KIND_DELETION = 5;
export const KIND_REACTION = 7;
/** Chat message in a stream channel (NIP-29 group chat). What clients write. */
export const KIND_STREAM_MESSAGE = 9;
export const KIND_NIP29_DELETE_EVENT = 9005;
/**
 * Presence heartbeat. Ephemeral, so never stored: current status lives in the
 * relay's Redis and is synthesized for an authored `POST /query`.
 */
export const KIND_PRESENCE_UPDATE = 20001;
export const KIND_TYPING_INDICATOR = 20002;
/** NIP-29 group metadata — the relay-signed channel descriptor. */
export const KIND_NIP29_GROUP_METADATA = 39000;
export const KIND_NIP29_GROUP_ADMINS = 39001;
export const KIND_NIP29_GROUP_MEMBERS = 39002;
/** Stream message v2 — present in stored history; read alongside kind 9. */
export const KIND_STREAM_MESSAGE_V2 = 40002;
export const KIND_STREAM_MESSAGE_EDIT = 40003;
export const KIND_SYSTEM_MESSAGE = 40099;
/**
 * NIP-RS personal state: read positions, channel sections, mutes, stars.
 *
 * One addressable kind for several payloads, told apart by the `d` tag and a `t`
 * marker — so a filter for read state must scope on both.
 */
export const KIND_READ_STATE = 30078;

/**
 * NIP-38 user status — the free-text "in a meeting" line beside a name.
 *
 * Parameterized-replaceable on `d:general`, so an event carrying neither text
 * nor emoji is how a status is cleared.
 */
export const KIND_USER_STATUS = 30315;

/**
 * Forum post and comment.
 *
 * Included here because both are full-text indexed by the relay, so a message
 * search that omitted them would silently miss the long-form half of a
 * community's writing.
 */
export const KIND_FORUM_POST = 45001;
export const KIND_FORUM_COMMENT = 45003;

/**
 * Relay-signed channel activity snapshot.
 *
 * One event carries the last-activity timestamp for a whole shard of channels,
 * which is what unread badges read. Sharding is why this is a subscription
 * rather than a poll: the relay pushes at most a bounded number of these per
 * community per coalescing window, no matter how many messages arrive.
 */
export const KIND_CHANNEL_ACTIVITY_SNAPSHOT = 39007;

/**
 * Kinds that render as a row in a channel timeline.
 *
 * Both message kinds are included: `build_message` in `nuxx-sdk` writes kind 9,
 * but 40002 exists in stored history and from other producers, so a reader that
 * filters on only one of them silently loses messages.
 */
export const CHANNEL_TIMELINE_CONTENT_KINDS = [
  KIND_STREAM_MESSAGE,
  KIND_STREAM_MESSAGE_V2,
  KIND_SYSTEM_MESSAGE,
];

/**
 * Auxiliary kinds that modify an existing timeline row rather than adding one.
 *
 * These carry only an `e` tag — no `h` — so they are unreachable from an
 * `#h`-scoped channel filter and must be fetched by `#e` reference against the
 * message ids already on screen.
 */
export const CHANNEL_AUX_EVENT_KINDS = [
  KIND_REACTION,
  KIND_DELETION,
  KIND_NIP29_DELETE_EVENT,
  KIND_STREAM_MESSAGE_EDIT,
];

/** Everything a live channel subscription needs: content plus aux. */
export const CHANNEL_EVENT_KINDS = [
  ...CHANNEL_TIMELINE_CONTENT_KINDS,
  ...CHANNEL_AUX_EVENT_KINDS,
];
