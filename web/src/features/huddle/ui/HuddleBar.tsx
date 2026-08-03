import { Bot, Mic, MicOff, PhoneOff, UserPlus, Volume2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { formatRelativeTime } from "@/features/agents/agent-model";
import {
  resolveAvatarUrl,
  resolveUserLabel,
} from "@/features/profile/profile-model";
import { useMyPubkey } from "@/features/chat/use-chat";
import { useProfiles } from "@/features/profile/profile-store";
import {
  addHuddleParticipant,
  setHuddleMuted,
} from "@/features/showcase/showcase-mutations";
import {
  useShowcase,
  useShowcaseUpdate,
} from "@/features/showcase/use-showcase";
import { Menu, MenuItem } from "@/shared/ui/menu";
import { cn } from "@/shared/lib/cn";
import { PubkeyAvatar } from "@/shared/ui/PubkeyAvatar";

/**
 * The huddle bar: a call in progress, pinned above the composer.
 *
 * A bar rather than a room. A huddle in the original client was something that
 * happened *while* people were reading a channel, so taking over the screen
 * would have defeated it — the call is ambient and the text keeps going.
 *
 * Dismissible, because a mock of a call that cannot be left is a strange thing
 * to leave on someone's screen for the length of a demo.
 */
export function HuddleBar() {
  const showcase = useShowcase();
  const update = useShowcaseUpdate();
  const myPubkey = useMyPubkey();
  const [dismissed, setDismissed] = useState(false);
  const [muted, setMuted] = useState(false);
  const [nowSeconds, setNowSeconds] = useState(() =>
    Math.floor(Date.now() / 1000),
  );

  const huddle = showcase?.huddle ?? null;
  const participants = huddle?.participants ?? [];
  const profiles = useProfiles(participants.map((person) => person.pubkey));

  // The elapsed time is the one thing on this bar that has to move, or a call
  // that has been running for an hour looks the same as one just started.
  useEffect(() => {
    if (!huddle || dismissed) return;
    const timer = setInterval(
      () => setNowSeconds(Math.floor(Date.now() / 1000)),
      30_000,
    );
    return () => clearInterval(timer);
  }, [huddle, dismissed]);

  if (!huddle || dismissed) return null;

  return (
    <div
      className="flex shrink-0 flex-wrap items-center gap-3 border-t border-border bg-secondary/60 px-4 py-2"
      data-testid="huddle-bar"
    >
      <span className="inline-flex items-center gap-1.5 text-2xs font-medium">
        <Volume2 aria-hidden className="size-3.5 text-primary" />#
        {huddle.channel} でハドル中
      </span>

      <span className="text-badge text-muted-foreground">
        {formatRelativeTime(huddle.startedAt, nowSeconds)}に開始
      </span>

      <ul aria-label="参加者" className="flex items-center gap-1">
        {participants.map((person) => {
          const label = resolveUserLabel({
            pubkey: person.pubkey,
            profiles,
            preferResolvedSelfLabel: true,
          });
          return (
            <li className="relative" key={person.pubkey} title={label}>
              <PubkeyAvatar
                avatarUrl={resolveAvatarUrl(person.pubkey, profiles)}
                className={cn(
                  "rounded-full",
                  // A ring rather than a badge: who is talking is the one thing
                  // a glance at a call bar is for, and it has to survive the
                  // avatars being 24px.
                  person.speaking && "ring-2 ring-primary",
                )}
                label={label}
                pubkey={person.pubkey}
                size="sm"
              />
              {person.isAgent && (
                <span className="absolute -bottom-0.5 -right-0.5 flex size-3 items-center justify-center rounded-full bg-secondary">
                  <Bot aria-label="エージェント" className="size-2" />
                </span>
              )}
              {person.muted && (
                <span className="absolute -bottom-0.5 -left-0.5 flex size-3 items-center justify-center rounded-full bg-secondary">
                  <MicOff aria-label="ミュート中" className="size-2" />
                </span>
              )}
            </li>
          );
        })}
      </ul>

      <div className="ml-auto flex items-center gap-2">
        {update && (
          <Menu
            label="ハドルにエージェントを呼ぶ"
            testId="huddle-add-agent"
            trigger={<UserPlus />}
          >
            {(close) => {
              // Only agents not already in the call: offering someone who is
              // standing there is a menu item that cannot do anything.
              const candidates = (showcase?.agents ?? []).filter(
                (agent) =>
                  !participants.some((row) => row.pubkey === agent.pubkey),
              );
              if (candidates.length === 0) {
                return (
                  <p className="px-2 py-1.5 text-badge text-muted-foreground">
                    呼べるエージェントがいません。
                  </p>
                );
              }
              return candidates.map((agent) => (
                <MenuItem
                  icon={<Bot />}
                  key={agent.id}
                  onClick={() => {
                    close();
                    update((current) =>
                      addHuddleParticipant(current, {
                        pubkey: agent.pubkey,
                        speaking: false,
                        // An agent joins listening, with a transcript — it is not
                        // talking the moment it arrives.
                        muted: true,
                        isAgent: true,
                      }),
                    );
                    toast.success(`${agent.name} を呼びました`);
                  }}
                  testId={`huddle-invite-${agent.id}`}
                >
                  {agent.name}
                </MenuItem>
              ));
            }}
          </Menu>
        )}
        <button
          aria-label={muted ? "ミュートを解除" : "ミュート"}
          className="flex size-7 items-center justify-center rounded-md border border-border hover:bg-accent"
          data-testid="huddle-mute"
          onClick={() => {
            const next = !muted;
            setMuted(next);
            // Reflected on the reader's own avatar too, when they are in the
            // call: a mute button that leaves your own badge unmuted is telling
            // two stories about one microphone.
            if (myPubkey) {
              update?.((current) => setHuddleMuted(current, myPubkey, next));
            }
          }}
          type="button"
        >
          {muted ? (
            <MicOff aria-hidden className="size-3.5" />
          ) : (
            <Mic aria-hidden className="size-3.5" />
          )}
        </button>
        <button
          className="flex items-center gap-1 rounded-md bg-destructive px-2.5 py-1.5 text-2xs font-medium text-destructive-foreground"
          data-testid="huddle-leave"
          onClick={() => setDismissed(true)}
          type="button"
        >
          <PhoneOff aria-hidden className="size-3" />
          退出
        </button>
      </div>
    </div>
  );
}
