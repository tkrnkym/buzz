import { useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Bot,
  Check,
  Hash,
  KeyRound,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { useMyPubkey } from "@/features/chat/use-chat";
import {
  extractInviteCode,
  inviteCodeError,
} from "@/features/communities/community-model";
import {
  canSkip,
  markOnboardingSeen,
  nextStep,
  type OnboardingState,
  type OnboardingStep,
  previousStep,
  stepPosition,
  STEP_TITLES,
} from "@/features/onboarding/onboarding-model";
import { useAvatarUpload } from "@/features/profile/use-avatar-upload";
import { usePublishProfile } from "@/features/profile/use-profile";
import { cn } from "@/shared/lib/cn";
import { resolveSigner } from "@/shared/lib/signer";
import { derivedMembershipId } from "@/features/identity/membership";
import { PubkeyAvatar } from "@/shared/ui/PubkeyAvatar";

const FIELD_CLASS =
  "h-10 w-full rounded-md border border-border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

/**
 * First-run onboarding.
 *
 * The desktop client's version could mint a key, keep it in the OS keyring, and
 * show the reader their `nsec` to write down. A browser has nowhere safe to put a
 * secret key, so the identity step here is honest instead of reassuring: with a
 * NIP-07 extension it confirms custody, and without one it says plainly that the
 * key lasts one page load and what that costs.
 *
 * Every step after the welcome is skippable. A profile can be filled in later from
 * Settings, and a reader with no extension to install and no invite to paste must
 * not be trapped on a step they cannot complete.
 */
export function OnboardingFlow() {
  const navigate = useNavigate();
  const signer = resolveSigner();
  const myPubkey = useMyPubkey();
  const publishProfile = usePublishProfile();
  const avatarUpload = useAvatarUpload();

  const [step, setStep] = useState<OnboardingStep>("welcome");
  const [invite, setInvite] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");

  const state: OnboardingState = {
    hasExtension: signer.durable,
    // The invite step appears once there is something in the field, so a reader
    // who has a code can reach it and one who does not never sees it.
    hasInvite: invite.trim().length > 0,
  };
  const { index, total } = stepPosition(step, state);

  const finish = () => {
    markOnboardingSeen();
    void navigate({ to: "/" });
  };

  const advance = () => {
    const next = nextStep(step, state);
    if (next === "done") setStep("done");
    else setStep(next);
  };

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-6 py-10">
      <div className="w-full max-w-md">
        {/* A count rather than a bar: four steps is few enough that "2 / 3" is
            more informative than a partly filled line. */}
        {step !== "done" && (
          <p className="mb-2 text-badge text-muted-foreground">
            {index + 1} / {total}
          </p>
        )}

        <h1 className="text-lg font-semibold">{STEP_TITLES[step]}</h1>

        {step === "welcome" && (
          <div
            className="mt-4 flex flex-col gap-4"
            data-testid="onboarding-welcome"
          >
            <p className="text-sm text-muted-foreground">
              チャンネルで話し、エージェントに仕事を任せ、決まったことをフォーラムに残す場所です。
            </p>
            <ul className="flex flex-col gap-2.5">
              {[
                {
                  Icon: Hash,
                  text: "チャンネルとスレッドで会話します。",
                },
                {
                  Icon: Bot,
                  text: "エージェントは人と同じようにチャンネルに参加します。",
                },
                {
                  Icon: KeyRound,
                  text: "投稿はすべてあなたの鍵で署名されます。アカウントもパスワードもありません。",
                },
              ].map((row) => (
                <li className="flex items-start gap-2.5" key={row.text}>
                  <row.Icon
                    aria-hidden
                    className="mt-0.5 size-4 shrink-0 text-primary"
                  />
                  <span className="text-2xs text-muted-foreground">
                    {row.text}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {step === "identity" && (
          <div
            className="mt-4 flex flex-col gap-4"
            data-testid="onboarding-identity"
          >
            {signer.durable ? (
              <>
                <p className="flex items-start gap-2 text-sm">
                  <ShieldCheck
                    aria-hidden
                    className="mt-0.5 size-4 shrink-0 text-primary"
                  />
                  <span>
                    拡張機能があなたの鍵を持っています。このページが鍵を見ることはなく、再読み込みしても残ります。
                  </span>
                </p>
                {myPubkey && (
                  <dl className="rounded-lg border border-border px-3 py-2.5">
                    <dt className="text-badge text-muted-foreground">公開鍵</dt>
                    <dd
                      className="mt-0.5 break-all font-mono text-2xs"
                      data-testid="onboarding-pubkey"
                    >
                      {myPubkey}
                    </dd>
                  </dl>
                )}
              </>
            ) : (
              <>
                <p className="flex items-start gap-2 text-sm">
                  <ShieldAlert
                    aria-hidden
                    className="mt-0.5 size-4 shrink-0 text-destructive"
                  />
                  <span data-testid="onboarding-ephemeral-warning">
                    このブラウザには鍵を預かる拡張機能がありません。いまの鍵はこのページを開いている間だけのもので、再読み込みすると失われます
                    —
                    その鍵で投稿したものごと、あなたのものだと示せなくなります。
                  </span>
                </p>
                <div className="rounded-lg border border-border px-3 py-2.5">
                  <p className="text-2xs font-medium">続けるには</p>
                  <p className="mt-0.5 text-badge text-muted-foreground">
                    NIP-07 対応の拡張機能（nos2x、Alby
                    など）を入れてから、このページを開き直してください。鍵は拡張機能の中に留まります。
                  </p>
                </div>
                <p className="text-badge text-muted-foreground">
                  試すだけならこのまま進められます。書いたものは残りません。
                </p>
              </>
            )}
          </div>
        )}

        {step === "profile" && (
          <div
            className="mt-4 flex flex-col gap-4"
            data-testid="onboarding-profile"
          >
            <p className="text-2xs text-muted-foreground">
              タイムラインでどう見えるかです。あとから設定で変えられます。
            </p>
            <div className="flex items-center gap-3">
              {myPubkey && (
                <PubkeyAvatar
                  avatarUrl={avatarUrl || null}
                  label={displayName || derivedMembershipId(myPubkey)}
                  pubkey={myPubkey}
                />
              )}
              <label className="min-w-0 flex-1">
                <span className="mb-1 block text-2xs font-medium text-muted-foreground">
                  表示名
                </span>
                <input
                  className={FIELD_CLASS}
                  data-testid="onboarding-display-name"
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="佐藤 美咲"
                  value={displayName}
                />
              </label>
            </div>

            <label className="flex flex-col gap-1">
              <span className="text-2xs font-medium text-muted-foreground">
                画像
              </span>
              <input
                accept="image/*"
                className="text-2xs"
                data-testid="onboarding-avatar"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) return;
                  void avatarUpload.upload(file).then((url) => {
                    if (url) setAvatarUrl(url);
                  });
                }}
                type="file"
              />
              {avatarUpload.error && (
                <span className="text-badge text-destructive">
                  {avatarUpload.error}
                </span>
              )}
            </label>
          </div>
        )}

        {step === "invite" && (
          <div
            className="mt-4 flex flex-col gap-3"
            data-testid="onboarding-invite"
          >
            <p className="text-2xs text-muted-foreground">
              招待コードか招待リンクを貼ってください。
            </p>
            <input
              className={FIELD_CLASS}
              data-testid="onboarding-invite-input"
              onChange={(event) => setInvite(event.target.value)}
              placeholder="https://… または コード"
              value={invite}
            />
            {invite && inviteCodeError(extractInviteCode(invite)) && (
              <span className="text-badge text-destructive">
                {inviteCodeError(extractInviteCode(invite))}
              </span>
            )}
          </div>
        )}

        {step === "done" && (
          <div
            className="mt-4 flex flex-col gap-4"
            data-testid="onboarding-done"
          >
            <p className="flex items-start gap-2 text-sm">
              <Sparkles
                aria-hidden
                className="mt-0.5 size-4 shrink-0 text-primary"
              />
              <span>
                これで使いはじめられます。#general から覗いてみてください。
              </span>
            </p>
          </div>
        )}

        <div className="mt-6 flex items-center gap-2">
          {step !== "welcome" && step !== "done" && (
            <button
              className="flex items-center gap-1 rounded-md px-2 py-2 text-2xs text-muted-foreground hover:text-foreground"
              data-testid="onboarding-back"
              onClick={() => setStep(previousStep(step, state))}
              type="button"
            >
              <ArrowLeft aria-hidden className="size-3" />
              戻る
            </button>
          )}

          <button
            className={cn(
              "flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground",
              "disabled:opacity-60",
            )}
            data-testid="onboarding-next"
            disabled={publishProfile.isPending || avatarUpload.isUploading}
            onClick={() => {
              if (step === "done") {
                finish();
                return;
              }
              // The profile is published on the way out of its own step, not at
              // the end: a reader who closes the tab on the invite step should
              // still have the name they typed.
              if (step === "profile" && displayName.trim()) {
                publishProfile.mutate(
                  {
                    displayName: displayName.trim(),
                    name: "",
                    about: "",
                    avatarUrl,
                  },
                  {
                    onSuccess: () => advance(),
                    onError: (error) => {
                      toast.error(
                        error instanceof Error
                          ? error.message
                          : "プロフィールを保存できませんでした",
                      );
                      // Advance anyway. Being unable to save a display name is not
                      // a reason to hold someone at the door.
                      advance();
                    },
                  },
                );
                return;
              }
              advance();
            }}
            type="button"
          >
            {step === "done" ? (
              <>
                <Check aria-hidden className="size-4" />
                はじめる
              </>
            ) : (
              "次へ"
            )}
          </button>

          {canSkip(step) && (
            <button
              className="rounded-md px-2 py-2 text-2xs text-muted-foreground hover:text-foreground"
              data-testid="onboarding-skip"
              onClick={advance}
              type="button"
            >
              あとで
            </button>
          )}

          {step === "welcome" && (
            <button
              className="ml-auto rounded-md px-2 py-2 text-2xs text-muted-foreground hover:text-foreground"
              data-testid="onboarding-dismiss"
              onClick={finish}
              type="button"
            >
              とりあえず見る
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
