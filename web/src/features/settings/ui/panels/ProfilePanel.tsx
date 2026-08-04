import { ChevronDown, Pencil } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { useMyPubkey } from "@/features/chat/use-chat";
import { resolveUserLabel } from "@/features/profile/profile-model";
import { useProfiles } from "@/features/profile/profile-store";
import { useAvatarUpload } from "@/features/profile/use-avatar-upload";
import {
  useMyProfile,
  usePublishProfile,
} from "@/features/profile/use-profile";
import {
  SettingCard,
  SettingGroupHeading,
  SettingRow,
} from "@/features/settings/ui/SettingRow";
import { cn } from "@/shared/lib/cn";
import { relayWsUrl } from "@/shared/lib/relay-url";
import { resolveSigner } from "@/shared/lib/signer";
import { PubkeyAvatar } from "@/shared/ui/PubkeyAvatar";

const FIELD_CLASS =
  "h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

/** A field's committed value, or a muted "Not set". */
function Value({ value }: { value: string }) {
  return value ? (
    <span className="break-words">{value}</span>
  ) : (
    <span className="text-muted-foreground">Not set</span>
  );
}

/**
 * Profile: the avatar, the fields, the key, and the way out.
 *
 * Read-first. The screen opens showing what is published — the portrait large and
 * centred, then the fields as label-and-value rows — and turns into a form only when
 * Edit is pressed. A profile is read far more often than it is changed, and a screen
 * of input boxes makes the reader parse a form to answer "what does everyone see".
 *
 * Identity is collapsed, because the key is not something anyone came here to read;
 * it is something they need once, and then need in full.
 *
 * Sign out is last and separated, with the consequence stated before the button
 * rather than in a confirmation after it.
 */
export function ProfilePanel() {
  const avatarUpload = useAvatarUpload();
  const avatarInput = useRef<HTMLInputElement>(null);
  const pubkey = useMyPubkey();
  const profile = useMyProfile();
  const profiles = useProfiles(pubkey ? [pubkey] : []);
  const publishProfile = usePublishProfile();
  const signer = resolveSigner();

  const [editing, setEditing] = useState(false);
  const [identityOpen, setIdentityOpen] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [name, setName] = useState("");
  const [about, setAbout] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");

  // Seed the form from the loaded profile. kind:0 is replaceable, so a submit
  // sends the whole object — a form that started empty would silently clear every
  // field the reader did not retype.
  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.displayName ?? "");
    setName(profile.name ?? "");
    setAbout(profile.about ?? "");
    setAvatarUrl(profile.avatarUrl ?? "");
  }, [profile]);

  const label = pubkey
    ? resolveUserLabel({ pubkey, profiles, preferResolvedSelfLabel: true })
    : "";

  const onPickAvatar = async (file: File | undefined) => {
    if (!file) return;
    const url = await avatarUpload.upload(file);
    if (url) setAvatarUrl(url);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-2 py-4">
        <span className="relative">
          {pubkey && (
            <PubkeyAvatar
              avatarUrl={avatarUrl || null}
              label={displayName || label}
              pubkey={pubkey}
              shape="circle"
              size="xl"
            />
          )}
          <input
            accept="image/*"
            aria-label="画像を選ぶ"
            className="sr-only"
            onChange={(event) => {
              void onPickAvatar(event.target.files?.[0]);
              // Reset so picking the same file again still fires.
              event.target.value = "";
            }}
            ref={avatarInput}
            type="file"
          />
          {/* On the portrait rather than beside it: the picture is the thing being
              changed, and a button labelled "Upload picture" three rows away is a
              control the reader has to connect to it. */}
          <button
            aria-label="アイコンを変える"
            className="absolute -bottom-1 -right-1 flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-colors hover:bg-primary/90 disabled:opacity-60"
            data-testid="upload-avatar"
            disabled={avatarUpload.isUploading}
            onClick={() => avatarInput.current?.click()}
            type="button"
          >
            <Pencil aria-hidden className="size-4" />
          </button>
        </span>
        {avatarUpload.error && (
          <p className="text-2xs text-destructive">
            {avatarUpload.error}{" "}
            <button
              className="underline"
              onClick={avatarUpload.dismissError}
              type="button"
            >
              閉じる
            </button>
          </p>
        )}
      </div>

      <SettingCard testId="profile-info">
        <div className="flex items-center justify-between gap-3 px-4 py-3.5">
          <h2 className="text-base font-semibold">Profile info</h2>
          <button
            className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-2xs font-medium hover:bg-accent"
            data-testid="edit-profile"
            onClick={() => setEditing((current) => !current)}
            type="button"
          >
            <Pencil aria-hidden className="size-3" />
            {editing ? "やめる" : "Edit"}
          </button>
        </div>

        {editing ? (
          <form
            className="flex flex-col gap-3 px-4 py-3.5"
            onSubmit={(event) => {
              event.preventDefault();
              publishProfile.mutate(
                { displayName, name, about, avatarUrl },
                {
                  onSuccess: () => {
                    toast.success("プロフィールを保存しました");
                    setEditing(false);
                  },
                  onError: (error) =>
                    toast.error(
                      error instanceof Error
                        ? error.message
                        : "保存できませんでした",
                    ),
                },
              );
            }}
          >
            <label className="flex flex-col gap-1">
              <span className="text-2xs font-medium text-muted-foreground">
                Display name
              </span>
              <input
                className={FIELD_CLASS}
                data-testid="settings-display-name"
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="タイムラインでの見え方"
                value={displayName}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-2xs font-medium text-muted-foreground">
                Handle
              </span>
              <input
                className={FIELD_CLASS}
                data-testid="settings-name"
                onChange={(event) => setName(event.target.value)}
                placeholder="メンションで使う短い名前"
                value={name}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-2xs font-medium text-muted-foreground">
                Profile description
              </span>
              <textarea
                className="min-h-20 w-full resize-y rounded-md border border-border bg-background px-2.5 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                data-testid="settings-about"
                onChange={(event) => setAbout(event.target.value)}
                value={about}
              />
            </label>
            <div className="flex items-center gap-3">
              <button
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                data-testid="save-profile"
                disabled={publishProfile.isPending}
                type="submit"
              >
                {publishProfile.isPending ? "保存中…" : "保存する"}
              </button>
              <p className="text-2xs text-muted-foreground">
                kind:0 は1件で全項目を運びます。空にした項目は消えます。
              </p>
            </div>
          </form>
        ) : (
          <>
            <SettingRow title="Display name">
              <Value value={displayName} />
            </SettingRow>
            <SettingRow title="Handle">
              <Value value={name} />
            </SettingRow>
            <SettingRow title="Profile description">
              <Value value={about} />
            </SettingRow>
          </>
        )}
      </SettingCard>

      <SettingCard testId="identity-card">
        <button
          aria-expanded={identityOpen}
          className="flex w-full items-start justify-between gap-3 px-4 py-3.5 text-left hover:bg-accent/40"
          data-testid="toggle-identity"
          onClick={() => setIdentityOpen((current) => !current)}
          type="button"
        >
          <span>
            <span className="block text-base font-semibold">Identity</span>
            <span className="mt-0.5 block text-2xs text-muted-foreground">
              {signer.durable
                ? "拡張機能が鍵を持っています。リロードしても残り、この画面が鍵を見ることはありません。"
                : "この端末では、鍵はこのページを開いている間だけ存在します。"}
            </span>
          </span>
          <ChevronDown
            aria-hidden
            className={cn(
              "mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform",
              identityOpen && "rotate-180",
            )}
          />
        </button>
        {identityOpen && (
          <dl
            className="flex flex-col gap-3 px-4 py-3.5 text-2xs"
            data-testid="identity-detail"
          >
            <div className="flex flex-col gap-0.5">
              <dt className="font-medium text-muted-foreground">Public key</dt>
              <dd className="break-all font-mono" data-testid="settings-pubkey">
                {pubkey ?? "resolving…"}
              </dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="font-medium text-muted-foreground">Relay</dt>
              <dd className="break-all font-mono">{relayWsUrl()}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="font-medium text-muted-foreground">Custody</dt>
              <dd data-testid="settings-custody">
                {signer.durable ? (
                  "NIP-07 拡張機能が鍵を保持しています。"
                ) : (
                  <span className="text-destructive">
                    このブラウザに NIP-07
                    拡張機能がないため、鍵はこのページ読み込みのためだけに作られました。リロードすると、それで公開したものごと失われます
                    — 上のプロフィールも含めて。
                  </span>
                )}
              </dd>
            </div>
          </dl>
        )}
      </SettingCard>

      <div className="flex flex-col gap-3">
        <SettingGroupHeading>Sign out</SettingGroupHeading>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <p className="min-w-48 flex-1 text-2xs text-muted-foreground">
            {/* Stated before the button, not in a dialog after it. A browser key is
                not recoverable, so "are you sure?" is the wrong place to learn what
                is about to be lost. */}
            この端末から鍵とローカルのデータを消します。
            {signer.durable
              ? "鍵は拡張機能側に残るので、同じ拡張機能があれば戻れます。"
              : "この端末の鍵はどこにも控えられていないため、取り消せません。"}
          </p>
          <button
            className="shrink-0 rounded-md bg-destructive px-3 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90"
            data-testid="delete-my-data"
            onClick={() => {
              // Only the local side is ours to clear: published events are on the
              // relay and a client cannot unpublish them, so promising more than
              // this would be the lie.
              localStorage.clear();
              sessionStorage.clear();
              toast.success("この端末のデータを消しました。リロードします。");
              window.setTimeout(() => window.location.assign("/welcome"), 600);
            }}
            type="button"
          >
            Delete my data
          </button>
        </div>
      </div>
    </div>
  );
}
