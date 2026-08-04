import { Archive, ArchiveRestore, HardDrive, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { formatRelativeTime } from "@/features/agents/agent-model";
import {
  addArchiveSubscription,
  removeArchiveSubscription,
  restoreArchivedIdentity,
} from "@/features/archive/archive-mutations";
import { resolveUserLabel } from "@/features/profile/profile-model";
import { useProfiles } from "@/features/profile/profile-store";
import {
  nextMockId,
  useShowcase,
  useShowcaseUpdate,
} from "@/features/showcase/use-showcase";
import { truncatePubkey } from "@/shared/lib/pubkey";
import { Checkbox } from "@/shared/ui/checkbox";

/**
 * Kinds a reader can choose to keep locally, grouped the way they think about
 * them rather than numerically.
 *
 * The numbers are shown anyway. Someone using this screen is deciding what to
 * spend disk on, and "messages" without the kinds is not enough to reason about
 * — but a bare list of integers is not either.
 */
const KIND_GROUPS: ReadonlyArray<{
  label: string;
  description: string;
  kinds: number[];
}> = [
  {
    label: "メッセージ",
    description: "本文、編集、削除、システム行",
    kinds: [9, 40002, 40003, 40099, 9005],
  },
  {
    label: "リアクションと絵文字",
    description: "kind 7 と、その絵文字定義",
    kinds: [7, 30030],
  },
  {
    label: "フォーラム",
    description: "投稿とコメント",
    kinds: [45001, 45003],
  },
  {
    label: "エージェントの記録",
    description: "セッションのフレームとターンの計測値",
    kinds: [20100, 30174],
  },
];

/**
 * Keeping a local copy of some of the community's history.
 *
 * The reason to want this is not backup — the relay has the events — it is being
 * able to read and search when the relay is unreachable, and keeping something
 * after a community shuts down. So the panel is organized around *what* to keep,
 * with the event count as the honest cost signal.
 *
 * The browser has no durable place to put gigabytes of history, so this is a
 * mock-up of the desktop client's panel and says so. IndexedDB could hold some of
 * it, but a quota the browser may evict without warning is not an archive, and
 * calling it one would be the lie.
 */
export function LocalArchiveSettings() {
  const showcase = useShowcase();
  const update = useShowcaseUpdate();
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set([9, 40002, 40003, 40099, 9005]),
  );

  if (!showcase) {
    return (
      <p className="text-2xs text-muted-foreground">
        アーカイブの状態はまだ読めていません。
      </p>
    );
  }

  const toggleGroup = (kinds: number[], on: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      for (const kind of kinds) {
        if (on) next.add(kind);
        else next.delete(kind);
      }
      return next;
    });

  const totalEvents = showcase.archiveSubscriptions.reduce(
    (sum, row) => sum + row.events,
    0,
  );

  return (
    <div className="flex flex-col gap-4" data-testid="local-archive-settings">
      <p className="text-2xs text-muted-foreground">
        ブラウザには数GBの履歴を確実に置ける場所がないので、これはデスクトップ版の設定の再現です。ブラウザの保存領域は予告なく消えることがあり、それをアーカイブとは呼べません。
      </p>

      <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-2.5">
        <HardDrive
          aria-hidden
          className="size-4 shrink-0 text-muted-foreground"
        />
        <span className="min-w-0 flex-1 text-2xs">
          <span className="block font-medium">
            {totalEvents.toLocaleString()} 件を保存済み
          </span>
          <span className="block text-badge text-muted-foreground">
            {showcase.archiveSubscriptions.length} 件の購読
          </span>
        </span>
      </div>

      <ul className="flex flex-col gap-1" data-testid="archive-subscriptions">
        {showcase.archiveSubscriptions.map((row) => (
          <li
            className="flex flex-wrap items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent/50"
            key={row.id}
          >
            <Archive
              aria-hidden
              className="size-3.5 shrink-0 text-muted-foreground"
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-2xs font-medium">
                {row.scope}
              </span>
              <span className="block text-badge text-muted-foreground">
                kind {row.kinds.join(", ")} · {row.events.toLocaleString()} 件 ·{" "}
                {formatRelativeTime(
                  row.lastSyncedAt,
                  Math.floor(Date.now() / 1000),
                )}
                に同期
              </span>
            </span>
            <button
              aria-label={`${row.scope} の購読を削除`}
              className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border text-destructive hover:bg-destructive/10"
              data-testid={`remove-archive-${row.id}`}
              disabled={update === null}
              onClick={() => {
                update?.((current) =>
                  removeArchiveSubscription(current, row.id),
                );
                toast.success(`${row.scope} の購読をやめました`);
              }}
              type="button"
            >
              <Trash2 aria-hidden className="size-3" />
            </button>
          </li>
        ))}
      </ul>

      <fieldset className="flex flex-col gap-2 border-t border-border pt-4">
        <legend className="mb-1 text-2xs font-medium text-muted-foreground">
          新しく保存するもの
        </legend>
        {KIND_GROUPS.map((group) => {
          const allOn = group.kinds.every((kind) => selected.has(kind));
          return (
            // Checkboxes, not switches: these pick which kinds go in one set,
            // which is what a checkbox means. The primitive rather than a raw
            // input so the box carries the accent fill like every other one.
            <div className="flex items-start gap-2.5" key={group.label}>
              <Checkbox
                checked={allOn}
                className="mt-0.5"
                data-testid={`archive-group-${group.kinds[0]}`}
                id={`archive-group-${group.kinds[0]}`}
                onCheckedChange={(checked) =>
                  toggleGroup(group.kinds, checked === true)
                }
              />
              <label
                className="min-w-0 cursor-pointer"
                htmlFor={`archive-group-${group.kinds[0]}`}
              >
                <span className="block text-2xs font-medium">
                  {group.label}
                </span>
                <span className="block text-badge text-muted-foreground">
                  {group.description} · kind {group.kinds.join(", ")}
                </span>
              </label>
            </div>
          );
        })}

        {/* The checkboxes had no action behind them, so choosing kinds did
            nothing at all. A picker that cannot be applied is a decision the
            reader makes and the screen throws away. */}
        <button
          className="mt-2 flex w-fit items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-2xs font-medium hover:bg-accent disabled:opacity-60"
          data-testid="start-archiving"
          disabled={update === null || selected.size === 0}
          onClick={() => {
            const kinds = [...selected].sort((left, right) => left - right);
            update?.((current) =>
              addArchiveSubscription(current, {
                id: nextMockId("arc"),
                // Named by what was chosen rather than "新しい購読": the list is
                // read to decide what to keep, and two rows called the same thing
                // cannot be told apart.
                scope: `選んだ ${kinds.length} 種類`,
                kinds,
                at: Math.floor(Date.now() / 1000),
              }),
            );
            toast.success("保存を始めました");
          }}
          type="button"
        >
          <Plus aria-hidden className="size-3" />
          これらを保存する
        </button>
      </fieldset>
    </div>
  );
}

/**
 * Members whose history has been archived.
 *
 * An archive is not a delete, and the distinction is the whole feature: someone
 * who leaves stops appearing in member lists while their messages stay where the
 * conversation needs them. A thread that lost half its replies when someone
 * resigned would be worse for everyone still working from it.
 *
 * Restoring is offered because an archive applied by mistake — or a member who
 * comes back — has to be undoable, and the relay has the kinds for it (9036).
 */
export function IdentityArchiveSettings() {
  const showcase = useShowcase();
  const update = useShowcaseUpdate();
  const nowSeconds = useMemo(() => Math.floor(Date.now() / 1000), []);
  const pubkeys = useMemo(
    () =>
      (showcase?.archivedIdentities ?? []).flatMap((row) => [
        row.pubkey,
        row.archivedBy,
      ]),
    [showcase],
  );
  const profiles = useProfiles(pubkeys);

  if (!showcase) {
    return (
      <p className="text-2xs text-muted-foreground">
        アーカイブ済みのメンバーはまだ読めていません。
      </p>
    );
  }

  const rows = showcase.archivedIdentities;

  return (
    <div
      className="flex flex-col gap-3"
      data-testid="identity-archive-settings"
    >
      <p className="text-2xs text-muted-foreground">
        アーカイブは削除ではありません。メンバー一覧から外れますが、発言はそのまま残ります
        —
        抜けた人の返信が消えたスレッドは、まだそれを読む人にとって困るだけなので。
      </p>

      {rows.length === 0 ? (
        <p className="text-2xs text-muted-foreground">
          アーカイブされたメンバーはいません。
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {rows.map((row) => (
            <li
              className="flex flex-wrap items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent/50"
              data-testid={`archived-${row.pubkey}`}
              key={row.pubkey}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-2xs font-medium">
                  {resolveUserLabel({
                    pubkey: row.pubkey,
                    profiles,
                    preferResolvedSelfLabel: true,
                  })}
                </span>
                <span className="block text-badge text-muted-foreground">
                  {truncatePubkey(row.pubkey)} ·{" "}
                  {formatRelativeTime(row.archivedAt, nowSeconds)}に{" "}
                  {resolveUserLabel({
                    pubkey: row.archivedBy,
                    profiles,
                    preferResolvedSelfLabel: true,
                  })}
                  が実行
                  {row.reason ? ` · ${row.reason}` : ""}
                </span>
              </span>
              <button
                className="flex shrink-0 items-center gap-1.5 rounded-md border border-border px-2 py-1 text-badge hover:bg-accent"
                data-testid={`unarchive-${row.pubkey}`}
                disabled={update === null}
                onClick={() => {
                  update?.((current) =>
                    restoreArchivedIdentity(current, row.pubkey),
                  );
                  toast.success("メンバーに戻しました");
                }}
                type="button"
              >
                <ArchiveRestore aria-hidden className="size-3" />
                戻す
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
