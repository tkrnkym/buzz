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
 * NIP-29 group commands.
 *
 * Commands, not content: the relay validates each one, executes it, and
 * publishes the outcome as new metadata (39000) or a system message (40099).
 * Nothing here is stored as written, so there is no optimistic state to
 * reconcile.
 */
export const KIND_NIP29_CREATE_GROUP = 9007;
export const KIND_NIP29_JOIN_REQUEST = 9021;
export const KIND_NIP29_LEAVE_REQUEST = 9022;
/**
 * Presence heartbeat. Ephemeral, so never stored: current status lives in the
 * relay's Redis and is synthesized for an authored `POST /query`.
 */
export const KIND_PRESENCE_UPDATE = 20001;
export const KIND_TYPING_INDICATOR = 20002;
/**
 * Open a direct message.
 *
 * Carries only `p` tags: the relay allocates the channel and answers with its
 * metadata, so a client never has to derive an id for a set of people.
 */
export const KIND_DM_OPEN = 41010;
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
 * NIP-30 custom emoji: a member's preferred list, and their named sets.
 *
 * There is no server-side registry. Each member signs their own set, and the
 * workspace palette is the union of everyone's — a view computed on read rather
 * than stored state.
 */
export const KIND_EMOJI_LIST = 10030;
export const KIND_EMOJI_SET = 30030;

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
 * NIP-56 report — a member telling the moderators about an event or a person.
 *
 * The category rides the `e` tag's third element rather than the content, which
 * is what lets the relay triage a report without reading prose.
 */
export const KIND_REPORT = 1984;

/**
 * Community moderation commands, signed by a moderator.
 *
 * Commands, not records: the relay validates each one against the actor's role,
 * applies it, and exposes the outcome through `/moderation/*`. None of them
 * carries an `h` tag — the community comes from the connection host, and a
 * channel-scoped moderation command is rejected rather than narrowed.
 */
export const KIND_MODERATION_BAN = 9040;
export const KIND_MODERATION_UNBAN = 9041;
export const KIND_MODERATION_TIMEOUT = 9042;
export const KIND_MODERATION_UNTIMEOUT = 9043;
export const KIND_MODERATION_RESOLVE_REPORT = 9044;

/**
 * Product feedback.
 *
 * Accepted at ingest and sidecarred to the deployment's feedback table — never
 * stored as an event and never fanned out. So this is the one kind a client
 * publishes that nobody, including its author, can read back.
 */
export const KIND_PRODUCT_FEEDBACK = 42000;

/**
 * NIP-51 mute list — people this reader does not want to see.
 *
 * A personal list, unlike everything else above: nothing is asked of the relay
 * and no moderator is involved, so muting works for an ordinary member and is
 * invisible to the person muted.
 */
export const KIND_MUTE_LIST = 10000;

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
 * Everything an `#h`-scoped channel subscription must ask for.
 *
 * The content kinds plus the two modifiers that *do* carry an `h` tag: an edit
 * (40003) and the Nuxx tombstone (9005). Leaving them out is invisible — the
 * timeline renders, it just never applies anyone's edit or removal — which is
 * exactly what this client did until it was noticed.
 */
export const CHANNEL_H_SCOPED_KINDS = [
  ...CHANNEL_TIMELINE_CONTENT_KINDS,
  KIND_STREAM_MESSAGE_EDIT,
  KIND_NIP29_DELETE_EVENT,
];

/**
 * Modifiers that carry only an `e` tag, never an `h`.
 *
 * A reaction (`nuxx-sdk::build_reaction`) and a NIP-09 deletion both omit the
 * channel, so no `#h` subscription can reach them: they have to be fetched by
 * `#e` against the message ids already on screen.
 */
export const CHANNEL_E_SCOPED_KINDS = [KIND_REACTION, KIND_DELETION];
