import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  Globe,
  Lock,
  Users,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { useMyPubkey } from "@/features/chat/use-chat";
import {
  hostedNameError,
  hostedRelayUrl,
  JOIN_POLICY_LABELS,
  type JoinPolicy,
} from "@/features/communities/community-model";
import {
  canAdvance,
  EMPTY_HOSTED_DRAFT,
  HOSTED_STEP_TITLES,
  HOSTED_STEPS,
  hostedDraftToCommunity,
  hostedInviteLink,
  inviteRecipients,
  nextStep,
  previousStep,
  stepIndex,
  type HostedDraft,
  type HostedStep,
} from "@/features/communities/hosted-flow";
import { resolveUserLabel } from "@/features/profile/profile-model";
import { useProfiles } from "@/features/profile/profile-store";
import { addCommunity } from "@/features/showcase/showcase-mutations";
import {
  nextMockId,
  useShowcaseUpdate,
} from "@/features/showcase/use-showcase";
import { cn } from "@/shared/lib/cn";
import { PubkeyAvatar } from "@/shared/ui/PubkeyAvatar";

/**
 * The light surface of the setup flow.
 *
 * The gradient is the branded one, so the flow looks like the product rather than
 * like a form; the fixed light palette is deliberate and is why the
 * `--nuxx-hosted-community-*` tokens exist. This is the one surface a person sees
 * *before* they have a community, so it cannot follow a theme they have not chosen
 * yet — and a dark panel here would be the first impression of a product they are
 * still deciding about.
 */
const SURFACE_STYLE = {
  backgroundImage:
    "linear-gradient(160deg, var(--nuxx-gradient-light-top), var(--nuxx-gradient-light-bottom))",
} as const;

const FIELD_CLASS =
  "h-10 w-full rounded-md border border-hosted-divider/40 bg-hosted-input px-3 text-sm text-hosted-fg placeholder:text-hosted-fg/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hosted-fg/20";

const POLICY_OPTIONS: { value: JoinPolicy; Icon: typeof Globe }[] = [
  { value: "open", Icon: Globe },
  { value: "invite", Icon: Lock },
  { value: "closed", Icon: Users },
];

/** Where in the flow the reader is. */
function StepDots({ step }: { step: HostedStep }) {
  const index = stepIndex(step);
  return (
    <p
      className="flex items-center gap-1.5 text-badge font-medium text-hosted-fg/60"
      data-testid="hosted-step-progress"
    >
      {HOSTED_STEPS.slice(0, -1).map((candidate, position) => (
        <span
          className={cn(
            "size-1.5 rounded-full",
            position <= index ? "bg-hosted-fg/70" : "bg-hosted-fg/20",
          )}
          key={candidate}
        />
      ))}
      <span className="ml-1">
        {Math.min(index + 1, HOSTED_STEPS.length - 1)} /{" "}
        {HOSTED_STEPS.length - 1}
      </span>
    </p>
  );
}

/**
 * Setting up a hosted community.
 *
 * Creating one used to be a name field and a toast, which is enough to name a
 * community and nothing like enough to have one. The person doing this has just
 * become its owner; the two questions that follow — who can get in, and who else
 * is in it — are the ones that are painful to find later, so they are asked here
 * while the reader is still thinking about the community.
 *
 * The ordering, the gates and what the finished draft becomes are all in
 * `hosted-flow.ts`.
 */
export function HostedCommunityFlow({
  onClose,
  open,
}: {
  onClose: () => void;
  open: boolean;
}) {
  const update = useShowcaseUpdate();
  const myPubkey = useMyPubkey();
  const profiles = useProfiles(myPubkey ? [myPubkey] : []);
  const [step, setStep] = useState<HostedStep>("name");
  const [draft, setDraft] = useState<HostedDraft>(EMPTY_HOSTED_DRAFT);
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  const nameError = draft.name ? hostedNameError(draft.name) : null;
  const recipients = inviteRecipients(draft);
  const inviteLink = hostedInviteLink(draft.name || "my-team", "demo-code");
  const owner = myPubkey
    ? resolveUserLabel({
        pubkey: myPubkey,
        profiles,
        preferResolvedSelfLabel: true,
      })
    : "あなた";

  const close = () => {
    onClose();
    setStep("name");
    setDraft(EMPTY_HOSTED_DRAFT);
    setCopied(false);
  };

  /** Commit the draft and move to the result. */
  const create = () => {
    update?.((current) =>
      addCommunity(
        current,
        hostedDraftToCommunity(draft, nextMockId("community")),
      ),
    );
    setStep("done");
  };

  return (
    // Not the `Dialog` primitive: that one calls `showModal()`, and a
    // full-window flow inside the browser's top layer cannot be scrolled past on
    // a short viewport. This is a plain overlay for the same reason onboarding is.
    <div
      aria-label="ホスト型コミュニティを作る"
      className="fixed inset-0 z-50 flex items-center justify-center bg-hosted-overlay/60 p-4"
      data-testid="hosted-flow"
      role="dialog"
    >
      <div
        className="flex max-h-full w-full max-w-lg flex-col overflow-hidden rounded-2xl text-hosted-fg shadow-xl"
        style={SURFACE_STYLE}
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-hosted-divider/30 px-6 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold">
              {HOSTED_STEP_TITLES[step]}
            </h2>
            {step !== "done" && <StepDots step={step} />}
          </div>
          <button
            className="shrink-0 rounded-md px-2 py-1 text-2xs font-medium text-hosted-fg/60 hover:text-hosted-fg"
            data-testid="hosted-flow-close"
            onClick={close}
            type="button"
          >
            やめる
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {step === "name" && (
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-2xs font-medium text-hosted-fg/70">
                  コミュニティ名
                </span>
                <input
                  className={FIELD_CLASS}
                  data-testid="hosted-name"
                  onChange={(event) =>
                    setDraft({ ...draft, name: event.target.value })
                  }
                  placeholder="my-team"
                  value={draft.name}
                />
              </label>
              {draft.name && !nameError && (
                <p className="text-badge text-hosted-fg/60">
                  URL: <code>{hostedRelayUrl(draft.name)}</code>
                </p>
              )}
              {nameError && (
                <p
                  className="text-badge text-destructive"
                  data-testid="hosted-name-error"
                >
                  {nameError}
                </p>
              )}
              {/* Who is about to own this. Said here rather than in a summary at
                  the end: it is a consequence of the button on this step, and a
                  consequence disclosed after the fact is not a disclosure. */}
              <div
                className="mt-2 flex items-center gap-3 rounded-lg bg-hosted-identity px-3 py-2.5"
                data-testid="hosted-owner"
              >
                <PubkeyAvatar
                  label={owner}
                  pubkey={myPubkey ?? "0".repeat(64)}
                  shape="circle"
                  size="sm"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-2xs font-medium">{owner}</span>
                  <span className="block text-badge text-hosted-fg/60">
                    このコミュニティのオーナーになります
                  </span>
                </span>
              </div>
            </div>
          )}

          {step === "policy" && (
            <div className="flex flex-col gap-2" data-testid="hosted-policies">
              {POLICY_OPTIONS.map(({ value, Icon }) => (
                <button
                  aria-pressed={draft.joinPolicy === value}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border px-3 py-3 text-left transition-colors",
                    draft.joinPolicy === value
                      ? "border-hosted-fg/40 bg-hosted-identity"
                      : "border-hosted-divider/30 bg-hosted-identity/50 hover:bg-hosted-identity",
                  )}
                  data-testid={`hosted-policy-${value}`}
                  key={value}
                  onClick={() => setDraft({ ...draft, joinPolicy: value })}
                  type="button"
                >
                  <Icon aria-hidden className="size-4 shrink-0" />
                  <span className="min-w-0 flex-1 text-2xs">
                    {JOIN_POLICY_LABELS[value]}
                  </span>
                  {draft.joinPolicy === value && (
                    <Check aria-hidden className="size-4 shrink-0" />
                  )}
                </button>
              ))}
              <p className="mt-1 text-badge text-hosted-fg/60">
                あとから変えられます。最初は招待だけにしておくのが安全です。
              </p>
            </div>
          )}

          {step === "invite" && (
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-2xs font-medium text-hosted-fg/70">
                  メールアドレスか公開鍵（改行かカンマ区切り）
                </span>
                <textarea
                  className="min-h-24 w-full rounded-md border border-hosted-divider/40 bg-hosted-input p-3 text-sm text-hosted-fg placeholder:text-hosted-fg/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hosted-fg/20"
                  data-testid="hosted-invite-to"
                  onChange={(event) =>
                    setDraft({ ...draft, inviteTo: event.target.value })
                  }
                  placeholder={"a@example.jp\nnpub1…"}
                  value={draft.inviteTo}
                />
              </label>
              <p className="text-badge text-hosted-fg/60">
                {recipients.length === 0
                  ? "空のままでも作れます。ひとりで始めて、あとから呼べます。"
                  : `${recipients.length} 人に招待を送ります。`}
              </p>
            </div>
          )}

          {step === "done" && (
            <div className="flex flex-col gap-3" data-testid="hosted-done">
              <p className="text-2xs">
                <code>{hostedRelayUrl(draft.name)}</code> を用意しました。
                {JOIN_POLICY_LABELS[draft.joinPolicy]}。
              </p>
              {/* The link for everyone who was not on the list — which is most
                  people, since a list is only the ones you could name now. */}
              <button
                className="flex items-center gap-2.5 rounded-lg bg-hosted-identity px-3 py-2.5 text-left"
                data-testid="hosted-copy-invite"
                onClick={() => {
                  void navigator.clipboard
                    .writeText(inviteLink)
                    .then(() => {
                      setCopied(true);
                      toast.success("招待リンクをコピーしました");
                    })
                    .catch(() => toast.error("コピーできませんでした"));
                }}
                type="button"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-2xs font-medium">招待リンク</span>
                  <span className="block truncate text-badge text-hosted-fg/60">
                    {inviteLink}
                  </span>
                </span>
                {copied ? (
                  <Check aria-hidden className="size-4 shrink-0" />
                ) : (
                  <Copy aria-hidden className="size-4 shrink-0" />
                )}
              </button>
            </div>
          )}
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-hosted-divider/30 px-6 py-4">
          {step !== "name" && step !== "done" ? (
            <button
              className="flex items-center gap-1 rounded-md px-2 py-1.5 text-2xs font-medium text-hosted-fg/60 hover:text-hosted-fg"
              data-testid="hosted-back"
              onClick={() => setStep(previousStep(step))}
              type="button"
            >
              <ArrowLeft aria-hidden className="size-3" />
              戻る
            </button>
          ) : (
            <span />
          )}

          {step === "invite" ? (
            // The committing action, so it is the one that looks committing —
            // everything before it is reversible by pressing 戻る.
            <button
              className="rounded-md bg-hosted-fg px-4 py-2 text-2xs font-medium text-hosted-commit-fg disabled:opacity-60"
              data-testid="hosted-create"
              disabled={update === null}
              onClick={create}
              type="button"
            >
              {recipients.length === 0
                ? "作成する"
                : `作成して ${recipients.length} 人に送る`}
            </button>
          ) : step === "done" ? (
            <button
              className="rounded-md bg-hosted-action px-4 py-2 text-2xs font-medium text-hosted-fg hover:bg-hosted-action-hover"
              data-testid="hosted-finish"
              onClick={close}
              type="button"
            >
              はじめる
            </button>
          ) : (
            <button
              className="flex items-center gap-1.5 rounded-md bg-hosted-action px-4 py-2 text-2xs font-medium text-hosted-fg hover:bg-hosted-action-hover disabled:opacity-60"
              data-testid="hosted-next"
              disabled={!canAdvance(step, draft)}
              onClick={() => setStep(nextStep(step))}
              type="button"
            >
              次へ
              <ArrowRight aria-hidden className="size-3" />
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
