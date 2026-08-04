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
import { AppearanceSettings } from "@/features/settings/ui/AppearanceSettings";
import { Section } from "@/features/settings/ui/Section";
import { relayWsUrl } from "@/shared/lib/relay-url";
import { resolveSigner } from "@/shared/lib/signer";
import { PubkeyAvatar } from "@/shared/ui/PubkeyAvatar";

const FIELD_CLASS =
  "h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

/**
 * The account panel: who you are, how the app looks, and which key signs it all.
 *
 * Identity sits last and says plainly whether the key survives a reload, because
 * everything above it is worthless if it is signed by a key that disappears.
 */
export function AccountPanel() {
  const avatarUpload = useAvatarUpload();
  const avatarInput = useRef<HTMLInputElement>(null);
  const pubkey = useMyPubkey();
  const profile = useMyProfile();
  const profiles = useProfiles(pubkey ? [pubkey] : []);
  const publishProfile = usePublishProfile();
  const signer = resolveSigner();

  const [displayName, setDisplayName] = useState("");
  const [name, setName] = useState("");
  const [about, setAbout] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");

  /** Upload a picked picture and put its URL in the field. */
  const onPickAvatar = async (file: File | undefined) => {
    if (!file) return;
    const url = await avatarUpload.upload(file);
    if (url) setAvatarUrl(url);
  };

  // Seed the form from the loaded profile. kind:0 is replaceable, so a submit
  // sends the whole object — a form that started empty would silently clear
  // every field the reader did not retype.
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

  return (
    <>
      <Section
        description="Published as a kind:0 event, signed by your key. Anyone in the community can read it."
        title="Profile"
      >
        <div className="flex items-center gap-3">
          {pubkey && (
            <PubkeyAvatar
              avatarUrl={avatarUrl || null}
              label={displayName || label}
              pubkey={pubkey}
            />
          )}
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex items-center gap-2">
              <input
                accept="image/*"
                aria-label="Upload a picture"
                className="sr-only"
                onChange={(event) => {
                  void onPickAvatar(event.target.files?.[0]);
                  // Reset so picking the same file again still fires.
                  event.target.value = "";
                }}
                ref={avatarInput}
                type="file"
              />
              <button
                className="rounded-md border border-border px-2.5 py-1.5 text-2xs font-medium hover:bg-accent disabled:opacity-60"
                data-testid="upload-avatar"
                disabled={avatarUpload.isUploading}
                onClick={() => avatarInput.current?.click()}
                type="button"
              >
                {avatarUpload.isUploading ? "Uploading…" : "Upload picture"}
              </button>
              {avatarUrl && (
                <button
                  className="rounded-md px-2 py-1.5 text-2xs text-muted-foreground hover:text-foreground"
                  data-testid="remove-avatar"
                  onClick={() => setAvatarUrl("")}
                  type="button"
                >
                  Remove
                </button>
              )}
            </div>
            <p className="text-2xs text-muted-foreground">
              {/* The upload only fills the field — kind:0 is one event
              carrying every field, so a picture is saved with the rest
              of the form rather than on its own. */}
              Stored on the relay's media host. Saved when you save the profile.
            </p>
            {avatarUpload.error && (
              <p className="text-2xs text-destructive">
                {avatarUpload.error}{" "}
                <button
                  className="underline"
                  onClick={avatarUpload.dismissError}
                  type="button"
                >
                  Dismiss
                </button>
              </p>
            )}
          </div>
        </div>

        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            publishProfile.mutate(
              { displayName, name, about, avatarUrl },
              {
                onSuccess: () => toast.success("Profile saved"),
                onError: (error) =>
                  toast.error(
                    error instanceof Error
                      ? error.message
                      : "Could not save the profile",
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
              placeholder="How you appear in the timeline"
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
              placeholder="Short name, used for mentions"
              value={name}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-2xs font-medium text-muted-foreground">
              Picture URL
            </span>
            <input
              className={FIELD_CLASS}
              data-testid="settings-avatar-url"
              onChange={(event) => setAvatarUrl(event.target.value)}
              placeholder="https://…"
              value={avatarUrl}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-2xs font-medium text-muted-foreground">
              About
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
              {publishProfile.isPending ? "Saving…" : "Save profile"}
            </button>
            <p className="text-2xs text-muted-foreground">
              Every field is published together. Clearing one removes it.
            </p>
          </div>
        </form>
      </Section>

      <AppearanceSettings />

      <Section
        description="Your key signs everything you publish. This client never sends it anywhere."
        title="Identity"
      >
        <dl className="flex flex-col gap-2 text-2xs">
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
                "A NIP-07 extension holds your key. It survives a reload and this page never sees it."
              ) : (
                <span className="text-destructive">
                  This browser has no NIP-07 extension, so the key was minted
                  for this page load only. Reloading loses it, along with
                  anything published under it — including the profile above.
                </span>
              )}
            </dd>
          </div>
        </dl>
      </Section>
    </>
  );
}
