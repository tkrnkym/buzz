/**
 * State the app shell owns and both panes read.
 *
 * This exists because two of these hooks must not be instantiated twice.
 * `useReadState` holds a per-mount slot id and publishes cursors under it, so a
 * second copy would write a second slot to the relay and then disagree with the
 * first about what has been read. `useUnreadChannels` derives from those same
 * cursors. Lifting them to the shell — which is what the desktop client's
 * `AppShellContext` did — means the sidebar badges and the open timeline are
 * always reading one answer.
 */

import { createContext, useContext, type ReactNode } from "react";

import type { Channel } from "@/features/chat/chat-model";
import { useChannels } from "@/features/chat/use-chat";
import {
  useReadState,
  type ReadStateApi,
} from "@/features/chat/use-read-state";
import { useUnreadChannels, type UnreadApi } from "@/features/chat/use-unread";
import {
  useSelfPresence,
  type SelfPresenceApi,
} from "@/features/profile/use-self-presence";
import {
  useChannelStars,
  type ChannelStarsApi,
} from "@/features/shell/use-channel-stars";

export interface ShellValue {
  channels: Channel[];
  channelsLoading: boolean;
  channelsError: Error | null;
  readState: ReadStateApi;
  unread: UnreadApi;
  stars: ChannelStarsApi;
  presence: SelfPresenceApi;
}

const ShellContext = createContext<ShellValue | null>(null);

export function ShellProvider({ children }: { children: ReactNode }) {
  const channels = useChannels();
  const readState = useReadState();
  // Unread comes from relay-published activity snapshots, not from a stream of
  // every message in the community. See `chat/unread.ts`.
  const unread = useUnreadChannels(readState.contexts);
  const stars = useChannelStars();
  // Here rather than in the profile card: the heartbeat has to keep running
  // while the reader is looking at any page in the shell, not only while the
  // card that shows it happens to be mounted.
  const presence = useSelfPresence();

  const value: ShellValue = {
    channels: channels.data ?? [],
    channelsLoading: channels.isLoading,
    channelsError: channels.error instanceof Error ? channels.error : null,
    readState,
    unread,
    stars,
    presence,
  };

  return (
    <ShellContext.Provider value={value}>{children}</ShellContext.Provider>
  );
}

export function useShell(): ShellValue {
  const value = useContext(ShellContext);
  if (!value) {
    throw new Error("useShell must be used inside <ShellProvider>");
  }
  return value;
}
