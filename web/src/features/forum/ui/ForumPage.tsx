import { Hash, MessageSquare, Pin, Plus } from "lucide-react";
import { useMemo, useState } from "react";

import { formatRelativeTime } from "@/features/agents/agent-model";
import {
  resolveAvatarUrl,
  resolveUserLabel,
} from "@/features/profile/profile-model";
import { useProfiles } from "@/features/profile/profile-store";
import { NotWiredUp, ShowcasePage } from "@/features/showcase/ui/ShowcasePage";
import { useShowcase } from "@/features/showcase/use-showcase";
import { cn } from "@/shared/lib/cn";
import { PubkeyAvatar } from "@/shared/ui/PubkeyAvatar";

/**
 * The forum: long posts with comments, alongside the chat channels.
 *
 * A separate surface from the timeline on purpose. A decision that needs to be
 * findable next month cannot live in a scrolling room, which is the problem
 * threads only half solve — a thread is still anchored to the moment someone
 * said something.
 *
 * Pinned posts sort first regardless of age, because that is the whole reason
 * to pin one.
 */
export function ForumPage() {
  const showcase = useShowcase();
  const [openId, setOpenId] = useState<string | null>(null);
  const nowSeconds = useMemo(() => Math.floor(Date.now() / 1000), []);

  const posts = useMemo(() => {
    const all = showcase?.forum ?? [];
    return [...all].sort(
      (left, right) =>
        Number(right.pinned) - Number(left.pinned) || right.at - left.at,
    );
  }, [showcase]);

  const people = useMemo(
    () =>
      posts.flatMap((post) => [
        post.authorPubkey,
        ...post.comments.map((comment) => comment.authorPubkey),
      ]),
    [posts],
  );
  const profiles = useProfiles(people);
  const open = posts.find((post) => post.id === openId) ?? null;

  if (!showcase) {
    return (
      <ShowcasePage subtitle="流れていかない話" title="Forum">
        <NotWiredUp what="フォーラム" />
      </ShowcasePage>
    );
  }

  const nameOf = (pubkey: string) =>
    resolveUserLabel({ pubkey, profiles, preferResolvedSelfLabel: true });

  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <ShowcasePage
        actions={
          <button
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-2xs font-medium text-primary-foreground disabled:opacity-60"
            disabled
            type="button"
          >
            <Plus aria-hidden className="size-3" />
            投稿する
          </button>
        }
        subtitle="流れていかない話"
        title="Forum"
      >
        <ul className="flex flex-col gap-3" data-testid="forum-list">
          {posts.map((post) => (
            <li key={post.id}>
              <button
                className={cn(
                  "w-full rounded-lg border px-4 py-3 text-left transition-colors",
                  open?.id === post.id
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-accent/50",
                )}
                data-testid={`forum-post-${post.id}`}
                onClick={() => setOpenId(post.id)}
                type="button"
              >
                <span className="flex items-start gap-3">
                  <PubkeyAvatar
                    avatarUrl={resolveAvatarUrl(post.authorPubkey, profiles)}
                    className="mt-0.5 rounded-full"
                    label={nameOf(post.authorPubkey)}
                    pubkey={post.authorPubkey}
                    size="sm"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      {post.pinned && (
                        <Pin
                          aria-label="固定"
                          className="size-3 shrink-0 text-primary"
                        />
                      )}
                      <span className="truncate text-sm font-medium">
                        {post.title}
                      </span>
                    </span>
                    <span className="mt-0.5 line-clamp-2 block text-2xs text-muted-foreground">
                      {post.body}
                    </span>
                    <span className="mt-1.5 flex flex-wrap items-center gap-2 text-badge text-muted-foreground">
                      <span>{nameOf(post.authorPubkey)}</span>
                      <span className="inline-flex items-center gap-0.5">
                        <Hash aria-hidden className="size-2.5" />
                        {post.channel}
                      </span>
                      <span>{formatRelativeTime(post.at, nowSeconds)}</span>
                      {post.replyCount > 0 && (
                        <span className="inline-flex items-center gap-0.5">
                          <MessageSquare aria-hidden className="size-2.5" />
                          {post.replyCount}
                        </span>
                      )}
                      {post.reactions.map((reaction) => (
                        <span key={reaction.emoji}>
                          {reaction.emoji} {reaction.count}
                        </span>
                      ))}
                    </span>
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </ShowcasePage>

      {open && (
        <aside
          aria-label={open.title}
          className="flex w-96 shrink-0 flex-col border-l border-border"
          data-testid="forum-thread-panel"
        >
          <header className="shrink-0 border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">{open.title}</h2>
            <p className="mt-0.5 text-badge text-muted-foreground">
              {nameOf(open.authorPubkey)} ·{" "}
              {formatRelativeTime(open.at, nowSeconds)}
            </p>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            <p className="whitespace-pre-wrap text-2xs">{open.body}</p>

            {open.comments.length > 0 && (
              <ul className="mt-5 flex flex-col gap-4">
                {open.comments.map((comment) => (
                  <li className="flex items-start gap-2" key={comment.id}>
                    <PubkeyAvatar
                      avatarUrl={resolveAvatarUrl(
                        comment.authorPubkey,
                        profiles,
                      )}
                      className="mt-0.5 rounded-full"
                      label={nameOf(comment.authorPubkey)}
                      pubkey={comment.authorPubkey}
                      size="sm"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-baseline gap-2">
                        <span className="text-2xs font-medium">
                          {nameOf(comment.authorPubkey)}
                        </span>
                        <span className="text-badge text-muted-foreground">
                          {formatRelativeTime(comment.at, nowSeconds)}
                        </span>
                      </p>
                      <p className="mt-0.5 whitespace-pre-wrap text-2xs text-muted-foreground">
                        {comment.body}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="shrink-0 border-t border-border px-4 py-3">
            <input
              className="h-9 w-full rounded-md border border-border bg-background px-2.5 text-2xs disabled:opacity-60"
              disabled
              placeholder="コメントする"
            />
          </div>
        </aside>
      )}
    </div>
  );
}
