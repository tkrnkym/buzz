import { ImagePlus, X } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import {
  isShortcode,
  shortcodeFromFilename,
  type CustomEmoji,
} from "@/features/emoji/emoji-model";
import { useMyEmoji } from "@/features/emoji/use-emoji";
import { useMyPubkey } from "@/features/chat/use-chat";
import { useAvatarUpload } from "@/features/profile/use-avatar-upload";
import {
  SettingCard,
  SettingGroupHeading,
  SettingRow,
} from "@/features/settings/ui/SettingRow";
import { FIELD_CONTROL_CLASS, FieldShell } from "@/shared/ui/field-row";

/**
 * The reader's own custom emoji.
 *
 * Editing publishes the whole kind:30030 set, because it is addressable: the
 * published event *is* the new state, so there is no add/remove protocol and nothing
 * to reconcile. What everyone else sees is the union of every member's set — which
 * is why this says "yours" rather than "the relay's".
 *
 * Image first, name second, and the name is suggested from the filename. Asking for
 * a shortcode before the picture means typing a name for something the reader has
 * not looked at yet.
 */
export function EmojiPanel() {
  const { emoji, save } = useMyEmoji();
  const myPubkey = useMyPubkey();
  const upload = useAvatarUpload();
  const fileInput = useRef<HTMLInputElement>(null);
  const [shortcode, setShortcode] = useState("");
  const [url, setUrl] = useState("");

  const normalized = shortcode.trim().toLowerCase().replace(/:/g, "");
  const duplicate = emoji.some((entry) => entry.shortcode === normalized);
  const valid =
    isShortcode(normalized) &&
    url.length > 0 &&
    !duplicate &&
    myPubkey !== null;

  const publish = (next: CustomEmoji[]) => {
    save.mutate(next, {
      onError: (error) =>
        toast.error(
          error instanceof Error ? error.message : "保存できませんでした",
        ),
    });
  };

  const clear = () => {
    setShortcode("");
    setUrl("");
  };

  return (
    <div className="flex flex-col gap-6">
      <SettingCard testId="emoji-form">
        <SettingRow
          description="正方形の画像が向いています。GIF・PNG・JPEG・WebP に対応しています。"
          title="Upload an image"
        >
          {/* The picked image, at the size it will be used. A filename tells the
              reader nothing about whether the emoji reads at 20px. */}
          <span className="flex size-14 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
            {url ? (
              <img
                alt=""
                className="size-full object-contain"
                data-testid="emoji-preview"
                src={url}
              />
            ) : (
              <ImagePlus aria-hidden className="size-5 text-muted-foreground" />
            )}
          </span>
          <input
            accept="image/*"
            aria-label="画像を選ぶ"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              void upload.upload(file).then((uploaded) => {
                if (!uploaded) return;
                setUrl(uploaded);
                // Only when the reader has not named it themselves, so a suggestion
                // never overwrites a decision.
                setShortcode((current) =>
                  current ? current : shortcodeFromFilename(file.name),
                );
              });
            }}
            ref={fileInput}
            type="file"
          />
          <button
            className="rounded-md border border-border px-2.5 py-1.5 text-2xs font-medium hover:bg-accent disabled:opacity-60"
            data-testid="upload-emoji"
            disabled={upload.isUploading}
            onClick={() => fileInput.current?.click()}
            type="button"
          >
            {upload.isUploading ? "アップロード中…" : "Upload image"}
          </button>
        </SettingRow>

        <SettingRow
          description="メッセージやリアクションで、これを入力して呼び出します。"
          title="Give it a name"
        >
          <FieldShell className="flex w-64 items-center gap-1 px-2.5 py-1.5">
            {/* The colons are the shell's, not the reader's: typed colons are
                stripped anyway, and showing them makes the field say what the
                finished shortcode looks like. */}
            <span className="select-none text-sm text-muted-foreground">:</span>
            <input
              aria-label="ショートコード"
              className={FIELD_CONTROL_CLASS}
              data-testid="emoji-shortcode"
              onChange={(event) => setShortcode(event.target.value)}
              placeholder="party_parrot"
              value={shortcode}
            />
            <span className="select-none text-sm text-muted-foreground">:</span>
          </FieldShell>
        </SettingRow>

        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
          <p className="min-w-48 flex-1 text-2xs text-muted-foreground">
            {duplicate
              ? `:${normalized}: はもう使っています。`
              : normalized && !isShortcode(normalized)
                ? "英小文字・数字・アンダースコアだけが使えます（NIP-30 の決まりです）。"
                : "先に画像を選ぶと、ファイル名から名前を提案します。"}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <button
              className="rounded-md px-3 py-1.5 text-2xs font-medium text-muted-foreground hover:text-foreground"
              data-testid="clear-emoji"
              onClick={clear}
              type="button"
            >
              Clear
            </button>
            <button
              className="rounded-md bg-primary px-3 py-1.5 text-2xs font-medium text-primary-foreground disabled:opacity-60"
              data-testid="save-emoji"
              disabled={!valid || save.isPending}
              onClick={() => {
                if (!myPubkey) return;
                publish([
                  ...emoji,
                  { shortcode: normalized, url, author: myPubkey, pack: null },
                ]);
                clear();
              }}
              type="button"
            >
              Save emoji
            </button>
          </div>
        </div>
      </SettingCard>

      <SettingGroupHeading>My emoji</SettingGroupHeading>
      {emoji.length === 0 ? (
        <SettingCard>
          <p
            className="px-4 py-3.5 text-2xs text-muted-foreground"
            data-testid="emoji-empty"
          >
            まだ追加していません。上から追加してください。
          </p>
        </SettingCard>
      ) : (
        <ul className="flex flex-wrap gap-2" data-testid="emoji-list">
          {emoji.map((entry) => (
            <li
              className="flex items-center gap-1.5 rounded-md bg-secondary px-2 py-1"
              key={entry.shortcode}
            >
              <img
                alt={`:${entry.shortcode}:`}
                className="size-5 object-contain"
                src={entry.url}
              />
              <span className="text-2xs text-secondary-foreground">
                :{entry.shortcode}:
              </span>
              <button
                aria-label={`:${entry.shortcode}: を削除`}
                className="text-muted-foreground hover:text-foreground"
                data-testid={`remove-emoji-${entry.shortcode}`}
                disabled={save.isPending}
                onClick={() =>
                  publish(
                    emoji.filter((row) => row.shortcode !== entry.shortcode),
                  )
                }
                type="button"
              >
                <X aria-hidden className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
