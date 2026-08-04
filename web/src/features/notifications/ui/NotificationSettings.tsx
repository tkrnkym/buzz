import { Bell, BellOff, Volume2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  notificationPermission,
  playNotificationSound,
  requestNotificationPermission,
} from "@/features/notifications/announce";
import type { NotificationPrefs } from "@/features/notifications/notification-prefs";
import {
  CATEGORY_LABELS,
  type NotificationCategory,
} from "@/features/notifications/notifications-model";
import { useNotificationPrefs } from "@/features/notifications/use-notifications";
import { cn } from "@/shared/lib/cn";
import { Switch } from "@/shared/ui/switch";

const CATEGORIES: NotificationCategory[] = ["mention", "dm", "reply"];

function Toggle({
  checked,
  description,
  label,
  onChange,
  testId,
}: {
  checked: boolean;
  description?: string;
  label: string;
  onChange: (next: boolean) => void;
  testId: string;
}) {
  return (
    // A switch, not a checkbox: these apply the moment they are flipped, with no
    // Save to press. The control sits on the right, where a setting's current
    // state is read down a column rather than hunted for beside each label.
    // `htmlFor` rather than a wrapping label, because a Radix switch is a
    // <button> — labelable, but not something a wrapper implicitly activates.
    <div className="flex items-start justify-between gap-3">
      <label className="min-w-0 cursor-pointer" htmlFor={testId}>
        <span className="block text-2xs font-medium">{label}</span>
        {description && (
          <span className="block text-badge text-muted-foreground">
            {description}
          </span>
        )}
      </label>
      <Switch
        checked={checked}
        className="mt-0.5 shrink-0"
        data-testid={testId}
        id={testId}
        onCheckedChange={onChange}
      />
    </div>
  );
}

/**
 * Notification settings.
 *
 * Local to this browser, not published — a laptop at a desk and a phone on a
 * train want different answers, and a synced setting would force one on both.
 *
 * The permission button is a button because it has to be: browsers ignore a
 * permission request that was not triggered by a gesture, so asking on load
 * would silently do nothing and leave the toggle looking broken.
 */
export function NotificationSettings() {
  const { prefs, setPrefs } = useNotificationPrefs();
  const [permission, setPermission] = useState(() => notificationPermission());

  const update = (patch: Partial<NotificationPrefs>) =>
    setPrefs({ ...prefs, ...patch });

  const askPermission = async () => {
    const result = await requestNotificationPermission();
    setPermission(result);
    if (result === "granted") {
      update({ desktop: true });
      toast.success("通知を許可しました");
    } else if (result === "denied") {
      // Only the browser can undo this, so say where rather than offering a retry
      // that will not prompt again.
      toast.error(
        "ブラウザ側でブロックされています。アドレスバーのサイト設定から変更してください。",
      );
    }
  };

  return (
    <div className="flex flex-col gap-4" data-testid="notification-settings">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-2xs font-medium text-muted-foreground">
          知らせる種類
        </legend>
        {CATEGORIES.map((category) => (
          <Toggle
            checked={prefs.categories[category]}
            key={category}
            label={CATEGORY_LABELS[category]}
            onChange={(next) =>
              update({ categories: { ...prefs.categories, [category]: next } })
            }
            testId={`notify-category-${category}`}
          />
        ))}
      </fieldset>

      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <Toggle
          checked={prefs.onlyWhenHidden}
          description="このタブを見ているときは鳴らしません。目の前にあるメッセージを知らせても意味がないので、既定で有効です。"
          label="バックグラウンドのときだけ"
          onChange={(next) => update({ onlyWhenHidden: next })}
          testId="notify-only-hidden"
        />

        <Toggle
          checked={prefs.sound}
          label="音を鳴らす"
          onChange={(next) => update({ sound: next })}
          testId="notify-sound"
        />
        {prefs.sound && (
          <button
            className="flex w-fit items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-badge hover:bg-accent"
            data-testid="notify-test-sound"
            onClick={() => {
              if (!playNotificationSound()) {
                toast.error("この環境では音を再生できませんでした");
              }
            }}
            type="button"
          >
            <Volume2 aria-hidden className="size-3" />
            試聴
          </button>
        )}
      </div>

      <div className="flex flex-col gap-2 border-t border-border pt-4">
        {permission === "unsupported" ? (
          <p className="flex items-center gap-1.5 text-2xs text-muted-foreground">
            <BellOff aria-hidden className="size-3.5" />
            このブラウザはデスクトップ通知に対応していません。
          </p>
        ) : permission === "granted" ? (
          <Toggle
            checked={prefs.desktop}
            description="タブを閉じていても、OSの通知として表示します。"
            label="デスクトップ通知"
            onChange={(next) => update({ desktop: next })}
            testId="notify-desktop"
          />
        ) : (
          <div className="flex flex-col items-start gap-2">
            <p className="text-2xs text-muted-foreground">
              {permission === "denied"
                ? "デスクトップ通知はブラウザ側でブロックされています。サイト設定から許可すると、ここで有効にできます。"
                : "デスクトップ通知には、ブラウザの許可が必要です。"}
            </p>
            <button
              className={cn(
                "flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-2xs font-medium hover:bg-accent",
                permission === "denied" && "opacity-60",
              )}
              data-testid="notify-request-permission"
              disabled={permission === "denied"}
              onClick={() => void askPermission()}
              type="button"
            >
              <Bell aria-hidden className="size-3" />
              通知を許可する
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
