import { Bot, Mic, MicOff, PhoneOff, Volume2 } from "lucide-react";
import { useEffect, useState } from "react";

import { formatRelativeTime } from "@/features/agents/agent-model";
import {
  resolveAvatarUrl,
  resolveUserLabel,
} from "@/features/profile/profile-model";
import { useProfiles } from "@/features/profile/profile-store";
import { useShowcase } from "@/features/showcase/use-showcase";
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
        <button
          aria-label={muted ? "ミュートを解除" : "ミュート"}
          className="flex size-7 items-center justify-center rounded-md border border-border hover:bg-accent"
          data-testid="huddle-mute"
          onClick={() => setMuted((current) => !current)}
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
