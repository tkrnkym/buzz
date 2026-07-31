import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  buildCreateChannelTemplate,
  buildDmOpenTemplate,
  buildJoinChannelTemplate,
  buildLeaveChannelTemplate,
  newChannelId,
  type ChannelKind,
  type ChannelVisibility,
} from "@/features/channels/channel-ops";
import { useRelaySession } from "@/shared/api/relay-provider";

/**
 * Create a channel.
 *
 * Resolves once the relay OKs the command, and returns the id the client chose —
 * which the caller uses to navigate into the new room. The channel list is
 * invalidated rather than optimistically extended: the relay publishes the group
 * metadata, and that is what the sidebar reads.
 */
export function useCreateChannel() {
  const session = useRelaySession();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      name: string;
      about?: string;
      visibility?: ChannelVisibility;
      channelType?: ChannelKind;
    }) => {
      const channelId = newChannelId();
      await session.publish(
        buildCreateChannelTemplate({ ...input, channelId }),
      );
      return { channelId };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["chat", "channels"] });
    },
  });
}

export function useJoinChannel() {
  const session = useRelaySession();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (channelId: string) =>
      session.publish(buildJoinChannelTemplate(channelId)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["chat", "channels"] });
    },
  });
}

export function useLeaveChannel() {
  const session = useRelaySession();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (channelId: string) =>
      session.publish(buildLeaveChannelTemplate(channelId)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["chat", "channels"] });
    },
  });
}

/**
 * Open (or reopen) a direct message.
 *
 * The relay decides whether a new room is needed and answers with its metadata,
 * so this returns nothing to navigate to directly — the caller waits for the
 * channel list to carry the DM. That is slower than guessing an id, and it is
 * the only correct option: a client-derived id would fork the conversation the
 * first time two clients disagreed about the participant ordering.
 */
export function useOpenDm() {
  const session = useRelaySession();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (pubkeys: string[]) =>
      session.publish(buildDmOpenTemplate(pubkeys)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["chat", "channels"] });
    },
  });
}
