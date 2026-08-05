import { Play } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  notificationPermission,
  playNotificationSound,
  requestNotificationPermission,
} from "@/features/notifications/announce";
import type { NotificationPrefs } from "@/features/notifications/notification-prefs";
import {
  SOUNDS,
  waveformBars,
  type SoundName,
} from "@/features/notifications/notification-sounds";
import {
  CATEGORY_LABELS,
  type NotificationCategory,
} from "@/features/notifications/notifications-model";
import { useNotificationPrefs } from "@/features/notifications/use-notifications";
import { SettingCard, SettingRow } from "@/features/settings/ui/SettingRow";
import { ValuePicker } from "@/shared/ui/field-row";
import { Switch } from "@/shared/ui/switch";

const CATEGORIES: ReadonlyArray<{
  id: NotificationCategory;
  description: string;
}> = [
  { id: "dm", description: "誰かがあなたに直接送ったとき。" },
  { id: "mention", description: "チャンネルであなたが名前を呼ばれたとき。" },
  {
    id: "reply",
    description: "あなたが参加しているスレッドに返信があったとき。",
  },
  {
    id: "action",
    description: "承認待ちや、思い出してほしいことがあるとき。",
  },
];

const SOUND_OPTIONS = SOUNDS.map((sound) => ({
  value: sound.name,
  label: sound.label,
}));

/** The tone's shape, drawn from the recipe so it cannot disagree with it. */
function Waveform({ sound }: { sound: SoundName }) {
  const bars = waveformBars(sound);
  return (
    <span aria-hidden className="flex h-4 items-center gap-0.5">
      {bars.length === 0 ? (
        <span className="h-px w-6 bg-muted-foreground/50" />
      ) : (
        bars.map((bar) => (
          <span
            className="w-0.5 rounded-full bg-muted-foreground/70"
            key={bar.key}
            style={{ height: `${Math.round(bar.height * 100)}%` }}
          />
        ))
      )}
    </span>
  );
}

/**
 * Notifications: what gets through, and what it sounds like.
 *
 * Local to this browser, not published — a laptop at a desk and a phone on a train
 * want different answers, and a synced setting would force one on both.
 *
 * A sound per category, because the point of a sound is to say *what* arrived
 * without looking: a DM and a thread reply that sound identical carry no more
 * information than one beep. Each row previews its own tone, since choosing between
 * five names you cannot hear is not a choice.
 */
export function NotificationsPanel() {
  const { prefs, setPrefs } = useNotificationPrefs();
  const [permission, setPermission] = useState(() => notificationPermission());
  const [showAll, setShowAll] = useState(false);

  const update = (patch: Partial<NotificationPrefs>) =>
    setPrefs({ ...prefs, ...patch });

  const askPermission = async () => {
    const result = await requestNotificationPermission();
    setPermission(result);
    if (result === "denied") {
      toast.error("ブラウザ側で拒否されました。サイトの設定から変えられます。");
    }
  };

  const visible = showAll ? CATEGORIES : CATEGORIES.slice(0, 2);

  return (
    <div className="flex flex-col gap-6">
      <SettingCard>
        <SettingRow
          description={
            permission === "unsupported"
              ? "このブラウザは通知に対応していません。"
              : permission === "granted"
                ? "下で有効にした種類について、OS の通知を出します。"
                : "OS に許可を求める必要があります。"
          }
          testId="desktop-alerts-row"
          title="Desktop alerts"
        >
          {permission === "granted" ? (
            <Switch
              checked={prefs.desktop}
              data-testid="pref-desktop"
              onCheckedChange={(next) => update({ desktop: next })}
            />
          ) : (
            <button
              className="rounded-md border border-border px-2.5 py-1.5 text-2xs font-medium hover:bg-accent disabled:opacity-60"
              data-testid="ask-permission"
              disabled={permission !== "default"}
              onClick={() => void askPermission()}
              type="button"
            >
              許可する
            </button>
          )}
        </SettingRow>

        <SettingRow
          description="開いている会話に届いた直接メッセージにも通知します。"
          title="Notify while viewing"
        >
          <Switch
            checked={!prefs.onlyWhenHidden}
            data-testid="pref-while-viewing"
            onCheckedChange={(next) => update({ onlyWhenHidden: !next })}
          />
        </SettingRow>
      </SettingCard>

      <SettingCard>
        <SettingRow description="下の項目で音を鳴らします。" title="Sound">
          <Switch
            checked={prefs.sound}
            data-testid="pref-sound"
            onCheckedChange={(next) => update({ sound: next })}
          />
        </SettingRow>
      </SettingCard>

      <SettingCard testId="notification-categories">
        {visible.map((category) => (
          <SettingRow
            description={category.description}
            key={category.id}
            testId={`pref-row-${category.id}`}
            title={CATEGORY_LABELS[category.id]}
          >
            <ValuePicker<SoundName>
              ariaLabel={`${CATEGORY_LABELS[category.id]} の音`}
              onChange={(next) =>
                update({ sounds: { ...prefs.sounds, [category.id]: next } })
              }
              options={SOUND_OPTIONS}
              testId={`sound-${category.id}`}
              value={prefs.sounds[category.id]}
            />
            <Waveform sound={prefs.sounds[category.id]} />
            <button
              aria-label={`${CATEGORY_LABELS[category.id]} の音を試す`}
              className="flex size-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent hover:text-foreground"
              data-testid={`preview-${category.id}`}
              onClick={() => {
                // Plays regardless of the master switch: this is the reader asking
                // to hear it, not a notification arriving.
                if (!playNotificationSound(prefs.sounds[category.id])) {
                  toast.error("音を鳴らせませんでした。");
                }
              }}
              type="button"
            >
              <Play aria-hidden className="size-3.5" />
            </button>
            <Switch
              checked={prefs.categories[category.id]}
              data-testid={`pref-category-${category.id}`}
              onCheckedChange={(next) =>
                update({
                  categories: { ...prefs.categories, [category.id]: next },
                })
              }
            />
          </SettingRow>
        ))}
      </SettingCard>

      {!showAll && CATEGORIES.length > visible.length && (
        <button
          className="mx-auto rounded-md border border-border px-3 py-1.5 text-2xs font-medium hover:bg-accent"
          data-testid="view-all-categories"
          onClick={() => setShowAll(true)}
          type="button"
        >
          View all
        </button>
      )}

      <SettingCard>
        <SettingRow
          description="メンションと対応が必要な項目について、サイドバーの Inbox にバッジを表示します。"
          testId="home-badge-row"
          title="Home badge"
        >
          <Switch
            checked={prefs.showHomeBadge}
            data-testid="pref-home-badge"
            onCheckedChange={(next) => update({ showHomeBadge: next })}
          />
        </SettingRow>
      </SettingCard>
    </div>
  );
}
