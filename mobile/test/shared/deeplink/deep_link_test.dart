import 'package:nuxx/shared/deeplink/deep_link.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  _inviteTests();
  _buildMessageLinkTests();
  _schemeDiscriminationTests();

  group('parseMessageDeepLink', () {
    test('parses channel and id', () {
      final link = parseMessageDeepLink(
        Uri.parse('nuxx://message?channel=d14cd131&id=abc123'),
      );
      expect(
        link,
        const MessageDeepLink(channelId: 'd14cd131', messageId: 'abc123'),
      );
    });

    test('parses optional thread param', () {
      final link = parseMessageDeepLink(
        Uri.parse('nuxx://message?channel=d14cd131&id=abc123&thread=root99'),
      );
      expect(link?.threadRootId, 'root99');
    });

    test('treats empty thread as absent', () {
      final link = parseMessageDeepLink(
        Uri.parse('nuxx://message?channel=d14cd131&id=abc123&thread='),
      );
      expect(link, isNotNull);
      expect(link?.threadRootId, isNull);
    });

    test('rejects missing channel', () {
      expect(parseMessageDeepLink(Uri.parse('nuxx://message?id=abc')), isNull);
    });

    test('rejects empty channel', () {
      expect(
        parseMessageDeepLink(Uri.parse('nuxx://message?channel=&id=abc')),
        isNull,
      );
    });

    test('rejects missing id', () {
      expect(
        parseMessageDeepLink(Uri.parse('nuxx://message?channel=d14cd131')),
        isNull,
      );
    });

    test('rejects non-nuxx scheme', () {
      expect(
        parseMessageDeepLink(Uri.parse('https://message?channel=a&id=b')),
        isNull,
      );
    });

    test('rejects non-message host (connect is desktop-only)', () {
      expect(
        parseMessageDeepLink(Uri.parse('nuxx://connect?relay=wss://x')),
        isNull,
      );
    });
  });
}

void _inviteTests() {
  group('parseInviteDeepLink', () {
    test('parses canonical HTTPS invite URL', () {
      final link = parseInviteDeepLink(
        Uri.parse('https://relay.example.com/invite/abc123'),
      );
      expect(
        link,
        const InviteDeepLink(
          relayUrl: 'wss://relay.example.com',
          code: 'abc123',
        ),
      );
    });

    test('parses HTTP invite URL for local/dev relays', () {
      final link = parseInviteDeepLink(
        Uri.parse('http://localhost:3000/invite/dev-code'),
      );
      expect(
        link,
        const InviteDeepLink(relayUrl: 'ws://localhost:3000', code: 'dev-code'),
      );
    });

    test('parses nuxx join handoff link', () {
      final link = parseInviteDeepLink(
        Uri.parse(
          'nuxx://join?relay=wss%3A%2F%2Frelay.example.com&code=abc123',
        ),
      );
      expect(
        link,
        const InviteDeepLink(
          relayUrl: 'wss://relay.example.com',
          code: 'abc123',
        ),
      );
    });

    test('normalizes trailing slash in nuxx join handoff', () {
      final link = parseInviteDeepLink(
        Uri.parse(
          'nuxx://join?relay=wss%3A%2F%2Frelay.example.com%2F&code=abc123',
        ),
      );
      expect(link?.relayUrl, 'wss://relay.example.com');
    });

    test('rejects plaintext public nuxx join handoff', () {
      final relay = Uri.encodeQueryComponent('ws://relay.example.com');
      expect(
        parseInviteDeepLink(Uri.parse('nuxx://join?relay=$relay&code=abc')),
        isNull,
      );
    });

    test('preserves policy receipt in nuxx join handoff', () {
      final link = parseInviteDeepLink(
        Uri.parse(
          'nuxx://join?relay=wss%3A%2F%2Frelay.example.com&code=abc123&policy_receipt=receipt.value',
        ),
      );
      expect(
        link,
        const InviteDeepLink(
          relayUrl: 'wss://relay.example.com',
          code: 'abc123',
          policyReceipt: 'receipt.value',
        ),
      );
    });

    test('rejects non-invite HTTPS paths', () {
      expect(
        parseInviteDeepLink(Uri.parse('https://relay.example.com/api/invites')),
        isNull,
      );
      expect(
        parseInviteDeepLink(Uri.parse('https://relay.example.com/invite/')),
        isNull,
      );
      expect(
        parseInviteDeepLink(Uri.parse('https://relay.example.com/invite/a/b')),
        isNull,
      );
    });

    test('rejects credentials and fragments', () {
      expect(
        parseInviteDeepLink(
          Uri.parse('https://user:pass@relay.example.com/invite/abc'),
        ),
        isNull,
      );
      expect(
        parseInviteDeepLink(
          Uri.parse('https://relay.example.com/invite/abc#x'),
        ),
        isNull,
      );
      expect(
        parseInviteDeepLink(
          Uri.parse(
            'nuxx://join?relay=wss%3A%2F%2Fuser%3Apass%40relay.example.com&code=abc',
          ),
        ),
        isNull,
      );
    });

    test('rejects nuxx join without websocket relay or code', () {
      expect(
        parseInviteDeepLink(
          Uri.parse('nuxx://join?relay=https://relay.example.com&code=abc'),
        ),
        isNull,
      );
      expect(
        parseInviteDeepLink(
          Uri.parse('nuxx://join?relay=wss://relay.example.com'),
        ),
        isNull,
      );
      expect(
        parseInviteDeepLink(Uri.parse('nuxx://connect?relay=wss://x')),
        isNull,
      );
    });

    test('rejects non-public invite relay destinations', () {
      for (final url in [
        'https://127.0.0.1/invite/abc',
        'https://169.254.169.254/invite/abc',
        'https://192.168.1.1/invite/abc',
        'https://[::1]/invite/abc',
        'https://[::ffff:127.0.0.1]/invite/abc',
      ]) {
        expect(parseInviteDeepLink(Uri.parse(url)), isNull, reason: url);
      }
    });

    test('rejects nuxx join with dangerous relay schemes', () {
      // The `relay=` param is an allowlist — only `ws` / `wss` are safe to
      // hand to a Nostr relay session. Anything else must be dropped by the
      // parser so a hostile QR / share link can't smuggle a browser scheme
      // (`javascript:`, `data:`), a local resource (`file:`), or an
      // unrelated transport (`ftp:`, `chrome:`) into the join flow.
      for (final hostile in [
        'javascript:alert(1)',
        'data:text/html,evil',
        'file:///etc/passwd',
        'ftp://relay.example.com',
        'chrome://settings',
        'about:blank',
        'ssh://relay.example.com',
      ]) {
        final encoded = Uri.encodeQueryComponent(hostile);
        expect(
          parseInviteDeepLink(Uri.parse('nuxx://join?relay=$encoded&code=abc')),
          isNull,
          reason: 'must reject relay scheme in $hostile',
        );
      }
    });
  });
}

/// Scheme discrimination: a well-formed link under any other scheme must not
/// resolve, however plausible it looks.
void _schemeDiscriminationTests() {
  group('scheme discrimination', () {
    test('a message link under a foreign scheme is refused', () {
      expect(
        parseMessageDeepLink(
          Uri.parse('other://message?channel=d14cd131&id=abc123'),
        ),
        isNull,
      );
    });

    test('an invite link under a foreign scheme is refused', () {
      expect(
        parseInviteDeepLink(
          Uri.parse('other://join?relay=wss%3A%2F%2Fr.example.com&code=abc'),
        ),
        isNull,
      );
    });

    test('new links are written with the current scheme only', () {
      final built = buildMessageLink(channelId: 'c', messageId: 'm');
      expect(built.startsWith('nuxx://message?'), isTrue);
      expect(built.startsWith('nuxx://message?'), isTrue);
    });

    test('an unrelated scheme is still refused', () {
      expect(
        parseMessageDeepLink(Uri.parse('nuxxx://message?channel=c&id=m')),
        isNull,
      );
    });
  });
}

void _buildMessageLinkTests() {
  group('buildMessageLink', () {
    test('builds channel + id link', () {
      expect(
        buildMessageLink(channelId: 'd14cd131', messageId: 'abc123'),
        'nuxx://message?channel=d14cd131&id=abc123',
      );
    });

    test('includes thread root when present', () {
      expect(
        buildMessageLink(
          channelId: 'd14cd131',
          messageId: 'abc123',
          threadRootId: 'root99',
        ),
        'nuxx://message?channel=d14cd131&id=abc123&thread=root99',
      );
    });

    test('treats empty thread root as absent', () {
      expect(
        buildMessageLink(
          channelId: 'd14cd131',
          messageId: 'abc123',
          threadRootId: '',
        ),
        'nuxx://message?channel=d14cd131&id=abc123',
      );
    });

    test('round-trips through parseMessageDeepLink', () {
      final url = buildMessageLink(
        channelId: 'chan-1',
        messageId: 'msg-1',
        threadRootId: 'root-1',
      );
      final parsed = parseMessageDeepLink(Uri.parse(url));
      expect(
        parsed,
        const MessageDeepLink(
          channelId: 'chan-1',
          messageId: 'msg-1',
          threadRootId: 'root-1',
        ),
      );
    });

    test('throws on empty channel or id', () {
      expect(
        () => buildMessageLink(channelId: '', messageId: 'abc'),
        throwsArgumentError,
      );
      expect(
        () => buildMessageLink(channelId: 'chan', messageId: ''),
        throwsArgumentError,
      );
    });
  });
}
