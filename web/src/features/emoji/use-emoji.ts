import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";

import { useMyPubkey } from "@/features/chat/use-chat";
import { useDirectory } from "@/features/directory/use-directory";
import {
  buildEmojiCatalog,
  buildEmojiFilters,
  buildEmojiSetTemplate,
  emojiFromEvent,
  MY_EMOJI_SET_D_TAG,
  type CustomEmoji,
  type EmojiCatalog,
} from "@/features/emoji/emoji-model";
import { postRelayQuery } from "@/shared/api/relay-http";
import { useRelaySession } from "@/shared/api/relay-provider";

/**
 * The workspace emoji palette.
 *
 * Read from everyone the reader shares a channel with, plus the reader
 * themselves — the same bound the directory has, for the same reason: a member
 * cannot enumerate a community they are not part of, so there is no wider set to
 * read. Refetched only when that membership changes; an emoji set is not
 * something anyone edits mid-conversation.
 */
export function useEmojiCatalog(): EmojiCatalog {
  const directory = useDirectory();
  const myPubkey = useMyPubkey();
  const [catalog, setCatalog] = useState<EmojiCatalog>({});

  // Joined so the fetch fires on a change of *who*, not on every new array with
  // the same people in it.
  const authorKey = [...directory.map((entry) => entry.pubkey), myPubkey ?? ""]
    .filter(Boolean)
    .join(",");

  useEffect(() => {
    const filters = buildEmojiFilters(authorKey ? authorKey.split(",") : []);
    if (filters.length === 0) {
      setCatalog({});
      return;
    }
    let active = true;

    postRelayQuery(filters)
      .then((events) => {
        if (!active) return;
        setCatalog(buildEmojiCatalog({ events, selfPubkey: myPubkey }));
      })
      .catch(() => {
        // No palette is a picker with only Unicode in it, not a broken
        // composer. The `emoji` tags on existing messages still render.
      });

    return () => {
      active = false;
    };
  }, [authorKey, myPubkey]);

  return catalog;
}

/** The emoji in the reader's own kind:30030 set, and a way to change it. */
export function useMyEmoji(): {
  emoji: CustomEmoji[];
  refresh: () => void;
  save: ReturnType<typeof useMutation<unknown, Error, CustomEmoji[]>>;
} {
  const session = useRelaySession();
  const myPubkey = useMyPubkey();
  const [emoji, setEmoji] = useState<CustomEmoji[]>([]);

  const refresh = useCallback(() => {
    if (!myPubkey) return;
    let active = true;
    postRelayQuery(buildEmojiFilters([myPubkey]))
      .then((events) => {
        if (!active) return;
        const mine = events
          .filter(
            (event) =>
              event.tags.find((tag) => tag[0] === "d")?.[1] ===
              MY_EMOJI_SET_D_TAG,
          )
          .flatMap(emojiFromEvent);
        setEmoji(mine);
      })
      .catch(() => {
        // Leave the last known set on screen rather than blanking the editor
        // under someone who is in the middle of adding to it.
      });
    return () => {
      active = false;
    };
  }, [myPubkey]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const save = useMutation<unknown, Error, CustomEmoji[]>({
    mutationFn: async (next) => session.publish(buildEmojiSetTemplate(next)),
    // The set is addressable, so the published event *is* the new state — no
    // merge, and nothing to reconcile against what the relay had.
    onSuccess: (_result, next) => setEmoji(next),
  });

  return useMemo(() => ({ emoji, refresh, save }), [emoji, refresh, save]);
}
