/// Parsing for `nuxx://` deep links.
///
/// Links are always *written* with [linkScheme].
///
/// `nuxx://message?channel=<uuid>&id=<hex>[&thread=<hex>]` references a
/// message (optionally inside a thread) in a channel. Required params that
/// are missing or empty make the link invalid — the caller never sees a
/// half-formed target.
library;

import '../relay/relay_validation.dart';

/// A parsed deep link supported by the app.
sealed class NuxxDeepLink {
  const NuxxDeepLink();
}

/// A parsed relay invite link.
///
/// Canonical share links are `https://<relay>/invite/<code>`. The custom
/// `nuxx://join?relay=<ws(s)://relay>&code=<code>` form is only an installed-app
/// handoff from the web landing page.
class InviteDeepLink extends NuxxDeepLink {
  /// Relay URL normalized to the websocket scheme used by the app.
  final String relayUrl;

  /// Invite code from the link.
  final String code;

  /// Optional receipt proving acceptance of the relay's current join policy.
  final String? policyReceipt;

  const InviteDeepLink({
    required this.relayUrl,
    required this.code,
    this.policyReceipt,
  });

  @override
  bool operator ==(Object other) =>
      other is InviteDeepLink &&
      other.relayUrl == relayUrl &&
      other.code == code &&
      other.policyReceipt == policyReceipt;

  @override
  int get hashCode => Object.hash(relayUrl, code, policyReceipt);

  @override
  String toString() =>
      'InviteDeepLink(relay: $relayUrl, code: $code, policyReceipt: $policyReceipt)';
}

/// Scheme new links are written with.
const String linkScheme = 'nuxx';

/// True when [scheme] is either accepted deep-link scheme.
bool isAcceptedLinkScheme(String scheme) => scheme == linkScheme;

/// A parsed `nuxx://message` deep link.
class MessageDeepLink extends NuxxDeepLink {
  /// Channel UUID from the `channel` query param.
  final String channelId;

  /// Event ID (hex) from the `id` query param.
  final String messageId;

  /// Optional thread root event ID from the `thread` query param.
  final String? threadRootId;

  const MessageDeepLink({
    required this.channelId,
    required this.messageId,
    this.threadRootId,
  });

  @override
  bool operator ==(Object other) =>
      other is MessageDeepLink &&
      other.channelId == channelId &&
      other.messageId == messageId &&
      other.threadRootId == threadRootId;

  @override
  int get hashCode => Object.hash(channelId, messageId, threadRootId);

  @override
  String toString() =>
      'MessageDeepLink(channel: $channelId, id: $messageId, '
      'thread: $threadRootId)';
}

/// Build a canonical `nuxx://message` link for a channel message.
///
/// Mirrors `web/src/features/chat/message-link.ts` so links copied or shared
/// from mobile round-trip through every client's parser:
/// `nuxx://message?channel=<uuid>&id=<eventId>[&thread=<rootId>]`.
///
/// An empty [threadRootId] is treated as "no thread" so callers can pass
/// through a nullable thread reference without extra checks.
String buildMessageLink({
  required String channelId,
  required String messageId,
  String? threadRootId,
}) {
  if (channelId.isEmpty) {
    throw ArgumentError('buildMessageLink: channelId is required');
  }
  if (messageId.isEmpty) {
    throw ArgumentError('buildMessageLink: messageId is required');
  }

  final params = <String, String>{
    'channel': channelId,
    'id': messageId,
    if (threadRootId != null && threadRootId.isNotEmpty) 'thread': threadRootId,
  };
  return Uri(
    scheme: linkScheme,
    host: 'message',
    queryParameters: params,
  ).toString();
}

/// Parse a `nuxx://message?…` URI into a [MessageDeepLink].
///
/// Returns `null` for unrecognised schemes, non-`message` hosts, or links
/// missing a non-empty `channel` or `id` param.
MessageDeepLink? parseMessageDeepLink(Uri uri) {
  if (!isAcceptedLinkScheme(uri.scheme) || uri.host != 'message') return null;

  final channel = uri.queryParameters['channel'];
  final id = uri.queryParameters['id'];
  if (channel == null || channel.isEmpty || id == null || id.isEmpty) {
    return null;
  }

  final thread = uri.queryParameters['thread'];
  return MessageDeepLink(
    channelId: channel,
    messageId: id,
    threadRootId: (thread == null || thread.isEmpty) ? null : thread,
  );
}

/// Parse canonical HTTPS invite links and `nuxx://join` app handoffs.
///
/// Accepted forms:
/// - `https://<relay>/invite/<code>` -> `wss://<relay>` + code
/// - `http://localhost/invite/<code>` -> `ws://localhost` + code in debug builds
/// - `nuxx://join?relay=<wss://relay>&code=<code>` -> relay + code
/// - `nuxx://join?relay=<ws://localhost>&code=<code>` -> local relay in debug
///
/// Rejects credentials, fragments, missing params, nested relay credentials, and
/// non-invite paths so scanners do not accidentally treat arbitrary URLs as
/// community admission links.
InviteDeepLink? parseInviteDeepLink(Uri uri) {
  if (uri.hasFragment || uri.userInfo.isNotEmpty) return null;

  if (isAcceptedLinkScheme(uri.scheme)) {
    if (uri.host != 'join') return null;
    final relay = uri.queryParameters['relay'];
    final code = uri.queryParameters['code'];
    if (relay == null || relay.isEmpty || code == null || code.isEmpty) {
      return null;
    }
    final relayUri = Uri.tryParse(relay);
    if (relayUri == null ||
        (relayUri.scheme != 'ws' && relayUri.scheme != 'wss') ||
        relayUri.host.isEmpty ||
        relayUri.userInfo.isNotEmpty ||
        relayUri.hasFragment) {
      return null;
    }
    try {
      validateInviteRelayUri(relayUri);
    } on FormatException {
      return null;
    }
    final normalizedRelay = Uri(
      scheme: relayUri.scheme,
      host: relayUri.host,
      port: relayUri.hasPort ? relayUri.port : null,
    ).toString();
    final policyReceipt = uri.queryParameters['policy_receipt'];
    return InviteDeepLink(
      relayUrl: normalizedRelay,
      code: code,
      policyReceipt: policyReceipt == null || policyReceipt.isEmpty
          ? null
          : policyReceipt,
    );
  }

  if (uri.scheme == 'https' || uri.scheme == 'http') {
    if (uri.host.isEmpty) return null;
    final segments = uri.pathSegments;
    if (segments.length != 2 ||
        segments[0] != 'invite' ||
        segments[1].isEmpty) {
      return null;
    }
    final relayScheme = uri.scheme == 'https' ? 'wss' : 'ws';
    final relayUri = Uri(
      scheme: relayScheme,
      host: uri.host,
      port: uri.hasPort ? uri.port : null,
    );
    try {
      validateInviteRelayUri(relayUri);
    } on FormatException {
      return null;
    }
    final relay = Uri(
      scheme: relayScheme,
      host: uri.host,
      port: uri.hasPort ? uri.port : null,
    ).toString();
    return InviteDeepLink(relayUrl: relay, code: segments[1]);
  }

  return null;
}

/// Parse any supported Nuxx deep link.
NuxxDeepLink? parseNuxxDeepLink(Uri uri) =>
    parseInviteDeepLink(uri) ?? parseMessageDeepLink(uri);
