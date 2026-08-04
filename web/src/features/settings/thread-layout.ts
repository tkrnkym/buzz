import { Columns2, Maximize2 } from "lucide-react";

import type { ValueOption } from "@/shared/ui/field-row";

/**
 * Where a thread opens.
 *
 * Per-browser rather than published, for the same reason the notification
 * preferences are (see `notification-prefs.ts`): it is a property of the window the
 * reader is sitting at. A 1280px laptop and a 2560px monitor want different answers,
 * and one synced value would force the same one on both.
 */

export type ThreadLayout = "split" | "full";

export const THREAD_LAYOUTS: ReadonlyArray<ValueOption<ThreadLayout>> = [
  {
    value: "split",
    label: "Split",
    icon: Columns2,
    hint: "チャンネルの横のパネルで開きます",
  },
  {
    value: "full",
    label: "Full",
    icon: Maximize2,
    hint: "スレッドがチャンネルの表示を引き継ぎます",
  },
];

export const DEFAULT_THREAD_LAYOUT: ThreadLayout = "split";

export const THREAD_LAYOUT_KEY = "nuxx-thread-layout.v1";

export function isThreadLayout(value: unknown): value is ThreadLayout {
  return value === "split" || value === "full";
}

/**
 * Read the stored layout, falling back to `split`.
 *
 * Split is the default because it keeps the room visible, which is what makes a
 * thread readable — the reply is usually about what someone else just said.
 */
export function readThreadLayout(raw: string | null | undefined): ThreadLayout {
  return isThreadLayout(raw) ? raw : DEFAULT_THREAD_LAYOUT;
}

/**
 * Whether the channel timeline stays on screen beside an open thread.
 *
 * The one thing the setting actually decides, expressed as the question `ChatPage`
 * asks — so the layout has a consumer rather than being a stored string nothing
 * reads.
 */
export function showsTimelineBesideThread(layout: ThreadLayout): boolean {
  return layout === "split";
}
