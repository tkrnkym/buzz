import { Hash, MessageSquare, Pin, PinOff, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { formatRelativeTime } from "@/features/agents/agent-model";
import {
  resolveAvatarUrl,
  resolveUserLabel,
} from "@/features/profile/profile-model";
import { useProfiles } from "@/features/profile/profile-store";
import { useMyPubkey } from "@/features/chat/use-chat";
import {
  addForumComment,
  addForumPost,
  removeForumPost,
  setForumPinned,
  toggleForumReaction,
} from "@/features/showcase/showcase-mutations";
import { NotWiredUp, ShowcasePage } from "@/features/showcase/ui/ShowcasePage";
import {
  nextMockId,
  useShowcase,
  useShowcaseUpdate,
} from "@/features/showcase/use-showcase";
import { FormDialog } from "@/shared/ui/form-dialog";
import { cn } from "@/shared/lib/cn";
import { PubkeyAvatar } from "@/shared/ui/PubkeyAvatar";

/** Offered on every post, so reacting is one click rather than a picker. */
const QUICK_REACTIONS = ["👍", "🎉", "🙏"];

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
  const update = useShowcaseUpdate();
  const myPubkey = useMyPubkey();
  const [openId, setOpenId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [comment, setComment] = useState("");
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
            data-testid="create-forum-post"
            disabled={update === null}
            onClick={() => setComposing(true)}
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
                        // Text, not a control: the whole row is already a button,
                        // and a button inside a button is not a thing. The panel
                        // is where a reaction is given — see below.
                        <span
                          className={cn(
                            reaction.mine && "font-medium text-foreground",
                          )}
                          key={reaction.emoji}
                        >
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
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold">{open.title}</h2>
                <p className="mt-0.5 text-badge text-muted-foreground">
                  {nameOf(open.authorPubkey)} ·{" "}
                  {formatRelativeTime(open.at, nowSeconds)}
                </p>
              </div>
              {update && (
                <div className="flex shrink-0 gap-1">
                  <button
                    aria-label={open.pinned ? "固定を解除" : "固定する"}
                    className="flex size-7 items-center justify-center rounded-md border border-border hover:bg-accent"
                    data-testid="toggle-pin"
                    onClick={() => {
                      update((current) =>
                        setForumPinned(current, open.id, !open.pinned),
                      );
                      toast.success(
                        open.pinned ? "固定を解除しました" : "固定しました",
                      );
                    }}
                    type="button"
                  >
                    {open.pinned ? (
                      <PinOff aria-hidden className="size-3" />
                    ) : (
                      <Pin aria-hidden className="size-3" />
                    )}
                  </button>
                  <button
                    aria-label="投稿を削除"
                    className="flex size-7 items-center justify-center rounded-md border border-border text-destructive hover:bg-destructive/10"
                    data-testid="delete-forum-post"
                    onClick={() => {
                      update((current) => removeForumPost(current, open.id));
                      // Close the panel: it is about to have nothing to show.
                      setOpenId(null);
                      toast.success("削除しました");
                    }}
                    type="button"
                  >
                    <Trash2 aria-hidden className="size-3" />
                  </button>
                </div>
              )}
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            <p className="whitespace-pre-wrap text-2xs">{open.body}</p>

            {/* Reactions used to be plain text here too. Every other mock-up
                surface lets the reader act on what it shows, so a count that
                could not be joined was the one thing on the screen that turned
                out not to be real. Same rule as the Pulse chips, from the same
                function — see `toggleReactionList`. */}
            <div className="mt-3 flex flex-wrap gap-1">
              {open.reactions.map((reaction) => (
                <button
                  aria-label={`${reaction.emoji} ${reaction.count}`}
                  aria-pressed={reaction.mine ?? false}
                  className={cn(
                    "inline-flex h-6 items-center gap-1 rounded-full border px-2 text-2xs leading-none disabled:opacity-60",
                    reaction.mine
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border bg-secondary hover:bg-accent",
                  )}
                  data-testid={`forum-reaction-${reaction.emoji}`}
                  disabled={update === null}
                  key={reaction.emoji}
                  onClick={() =>
                    update?.((current) =>
                      toggleForumReaction(current, open.id, reaction.emoji),
                    )
                  }
                  type="button"
                >
                  {reaction.emoji}
                  <span className="tabular-nums text-muted-foreground">
                    {reaction.count}
                  </span>
                </button>
              ))}
              {update &&
                QUICK_REACTIONS.filter(
                  (emoji) => !open.reactions.some((row) => row.emoji === emoji),
                ).map((emoji) => (
                  <button
                    aria-label={`${emoji} で反応する`}
                    className="inline-flex h-6 items-center rounded-full border border-dashed border-border px-2 text-2xs leading-none text-muted-foreground hover:bg-accent"
                    data-testid={`forum-add-reaction-${emoji}`}
                    key={emoji}
                    onClick={() =>
                      update((current) =>
                        toggleForumReaction(current, open.id, emoji),
                      )
                    }
                    type="button"
                  >
                    {emoji}
                  </button>
                ))}
            </div>

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

          <form
            className="flex shrink-0 gap-2 border-t border-border px-4 py-3"
            onSubmit={(event) => {
              event.preventDefault();
              const body = comment.trim();
              if (!body || !update) return;
              update((current) =>
                addForumComment(current, open.id, {
                  id: nextMockId("comment"),
                  authorPubkey: myPubkey ?? "",
                  body,
                  at: Math.floor(Date.now() / 1000),
                }),
              );
              setComment("");
            }}
          >
            <input
              className="h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-2.5 text-2xs disabled:opacity-60"
              data-testid="forum-comment-input"
              disabled={update === null}
              onChange={(event) => setComment(event.target.value)}
              placeholder="コメントする"
              value={comment}
            />
            <button
              className="shrink-0 rounded-md bg-primary px-3 text-2xs font-medium text-primary-foreground disabled:opacity-60"
              data-testid="forum-comment-submit"
              disabled={!comment.trim() || update === null}
              type="submit"
            >
              送信
            </button>
          </form>
        </aside>
      )}

      {composing && update && (
        <FormDialog
          description="流れていかない場所に書きます。チャンネルの会話とは別に残ります。"
          fields={[
            {
              name: "title",
              label: "タイトル",
              placeholder: "リリース手順を見直したい",
              required: true,
            },
            {
              name: "channel",
              label: "チャンネル",
              initial: "general",
              required: true,
            },
            {
              name: "body",
              label: "本文",
              multiline: true,
              placeholder: "何を、なぜ",
              required: true,
            },
          ]}
          onClose={() => setComposing(false)}
          onSubmit={(values) => {
            const id = nextMockId("forum");
            update((current) =>
              addForumPost(current, {
                id,
                title: values.title,
                body: values.body,
                channel: values.channel.replace(/^#/, ""),
                authorPubkey: myPubkey ?? "",
                at: Math.floor(Date.now() / 1000),
              }),
            );
            setComposing(false);
            // Open it, so the reader lands on what they just wrote.
            setOpenId(id);
            toast.success("投稿しました");
          }}
          submitLabel="投稿する"
          testId="create-forum-dialog"
          title="フォーラムに投稿"
        />
      )}
    </div>
  );
}
