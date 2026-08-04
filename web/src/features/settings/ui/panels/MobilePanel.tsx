import { Smartphone } from "lucide-react";

import { SettingCard, SettingRow } from "@/features/settings/ui/SettingRow";
import { relayWsUrl } from "@/shared/lib/relay-url";
import { resolveSigner } from "@/shared/lib/signer";

/**
 * Mobile: pointing the phone app at this relay.
 *
 * There is no pairing here, and the screen says so rather than showing a QR code
 * that would encode a key. Pairing means moving an identity between devices, and this
 * client cannot do that: with a NIP-07 extension the key never reaches the page, and
 * without one it exists only for this page load. A code that carried "the identity"
 * would either be empty or be a secret in a picture.
 *
 * What is actually useful is the relay address, which is what the phone app asks for
 * on its first screen.
 */
export function MobilePanel() {
  const signer = resolveSigner();

  return (
    <div className="flex flex-col gap-6">
      <SettingCard>
        <SettingRow
          description="スマートフォンのアプリで、最初に聞かれるアドレスです。"
          testId="mobile-relay-row"
          title="このコミュニティのリレー"
        >
          <code
            className="select-all rounded-md bg-muted px-2 py-1 font-mono text-2xs"
            data-testid="mobile-relay-url"
          >
            {relayWsUrl()}
          </code>
        </SettingRow>

        <SettingRow
          description={
            signer.durable
              ? "鍵は拡張機能が持っています。この画面から取り出すことはできないので、スマートフォン側でも同じ鍵を用意してください。"
              : "この端末の鍵はこのページを開いている間だけのものです。スマートフォンと同じ人として扱われるようにするには、まず拡張機能などで鍵を持たせてください。"
          }
          testId="mobile-identity-row"
          title="同じ人として使う"
        >
          <span className="flex size-9 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <Smartphone aria-hidden className="size-4" />
          </span>
        </SettingRow>
      </SettingCard>

      <p className="text-2xs text-muted-foreground">
        {/* Stated rather than mocked. A QR code here would have to encode either
            nothing or a secret key, and both are worse than the explanation. */}
        鍵を端末間で運ぶ仕組みはまだありません。QR
        コードを出す画面にしていないのは、この画面が鍵を持っていないか、持っていればそれを画像にすることになるかのどちらかで、どちらも見せるべきものではないからです。
      </p>
    </div>
  );
}
