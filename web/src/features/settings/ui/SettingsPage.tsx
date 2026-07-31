import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { useMyPubkey } from "@/features/chat/use-chat";
import { resolveUserLabel } from "@/features/profile/profile-model";
import { useProfiles } from "@/features/profile/profile-store";
import { usePublishProfile } from "@/features/profile/use-profile";
import { useMyProfile } from "@/features/profile/use-profile";
import { useTheme } from "@/shared/theme/ThemeProvider";
import { cn } from "@/shared/lib/cn";
import { relayWsUrl } from "@/shared/lib/relay-url";
import { resolveSigner } from "@/shared/lib/signer";
import { PubkeyAvatar } from "@/shared/ui/PubkeyAvatar";
import { SidebarTrigger } from "@/shared/ui/sidebar";

const FIELD_CLASS =
  "h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

function Section({
  children,
  description,
  title,
}: {
  children: React.ReactNode;
  description?: string;
  title: string;
}) {
  return (
    <section className="flex flex-col gap-3 border-b border-border py-6 first:pt-0 last:border-b-0">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        {description && (
          <p className="mt-0.5 text-2xs text-muted-foreground">{description}</p>
        )}
      </div>
      {children}
    </section>
  );
}

/**
 * Settings, ported in scope from the desktop client's panels.
 *
 * Three things a reader can actually change here: their profile, the theme, and
 * nothing about their identity — which is the point of the last section. It
 * states plainly whether the key in use survives a reload, because everything
 * else on this page is worthless if it is signed by a key that disappears.
 */
export function SettingsPage() {
  const pubkey = useMyPubkey();
  const profile = useMyProfile();
  const profiles = useProfiles(pubkey ? [pubkey] : []);
  const publishProfile = usePublishProfile();
  const { theme, setTheme } = useTheme();
  const signer = resolveSigner();

  const [displayName, setDisplayName] = useState("");
  const [name, setName] = useState("");
  const [about, setAbout] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");

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
    <section className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
        <SidebarTrigger className="md:-ml-1" />
        <h1 className="text-sm font-semibold">Settings</h1>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-6 py-6">
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
              <p className="text-2xs text-muted-foreground">
                The picture comes from a URL — this client has no upload for it
                yet.
              </p>
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

          <Section
            description="Follows the system by default. Both themes are Catppuccin — Latte and Macchiato."
            title="Appearance"
          >
            <div className="flex gap-2" data-testid="theme-picker">
              {(
                [
                  { value: "light", label: "Light", Icon: Sun },
                  { value: "dark", label: "Dark", Icon: Moon },
                  { value: "system", label: "System", Icon: Monitor },
                ] as const
              ).map(({ value, label: optionLabel, Icon }) => (
                <button
                  aria-pressed={theme === value}
                  className={cn(
                    "flex flex-1 flex-col items-center gap-1.5 rounded-lg border px-3 py-3 text-2xs font-medium transition-colors",
                    theme === value
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                  data-testid={`theme-${value}`}
                  key={value}
                  onClick={() => setTheme(value)}
                  type="button"
                >
                  <Icon aria-hidden className="size-4" />
                  {optionLabel}
                </button>
              ))}
            </div>
          </Section>

          <Section
            description="Your key signs everything you publish. This client never sends it anywhere."
            title="Identity"
          >
            <dl className="flex flex-col gap-2 text-2xs">
              <div className="flex flex-col gap-0.5">
                <dt className="font-medium text-muted-foreground">
                  Public key
                </dt>
                <dd
                  className="break-all font-mono"
                  data-testid="settings-pubkey"
                >
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
                      This browser has no NIP-07 extension, so the key was
                      minted for this page load only. Reloading loses it, along
                      with anything published under it — including the profile
                      above.
                    </span>
                  )}
                </dd>
              </div>
            </dl>
          </Section>
        </div>
      </div>
    </section>
  );
}
