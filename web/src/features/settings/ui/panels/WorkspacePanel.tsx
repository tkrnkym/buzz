import { Check, Link2, Pencil } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  ACCOUNT_HOST,
  formatLifetime,
  SESSION_LIFETIMES,
  SLUG_PROBLEM_MESSAGES,
  slugProblem,
  usesSharedRootCookie,
  workspaceHost,
} from "@/features/identity/workspace";
import {
  SettingCard,
  SettingGroupHeading,
  SettingRow,
} from "@/features/settings/ui/SettingRow";
import { NotWiredUp } from "@/features/showcase/ui/ShowcasePage";
import {
  useShowcase,
  useShowcaseUpdate,
} from "@/features/showcase/use-showcase";
import { FIELD_CONTROL_CLASS, FieldShell } from "@/shared/ui/field-row";

/**
 * The workspace's address, and how long being signed in to it lasts.
 *
 * The slug is editable and the internal id is not, which is the whole reason a
 * rename is safe: every reference points at the id, so only the URL moves. The
 * screen says what happens to the old one, because "will the link I sent last
 * week still work" is the question a rename actually raises.
 *
 * The session numbers are shown rather than set. They are a security property
 * of the platform, not a workspace preference — a workspace that could extend
 * its own absolute session ceiling would be a workspace that could opt out of
 * the ceiling.
 */
export function WorkspacePanel() {
  const showcase = useShowcase();
  const update = useShowcaseUpdate();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  if (!showcase) return <NotWiredUp what="Workspace の設定" />;

  const slug = showcase.workspaceSlug;
  const problem = editing ? slugProblem(draft.trim()) : null;

  const save = () => {
    const next = draft.trim();
    if (slugProblem(next)) return;
    update?.((current) => ({ ...current, workspaceSlug: next }));
    setEditing(false);
    toast.success(
      `${workspaceHost(next)} に変わりました。${workspaceHost(slug)} は 90 日間つながります。`,
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <SettingCard>
        <SettingRow
          description="この Workspace のアドレス。変えても中の ID は変わらないので、リンク以外は何も影響を受けません。"
          testId="workspace-slug-row"
          title="アドレス"
        >
          {editing ? (
            <span className="flex items-center gap-2">
              <FieldShell className="w-52 px-3 py-2">
                <input
                  aria-label="Workspace のアドレス"
                  className={FIELD_CONTROL_CLASS}
                  data-testid="workspace-slug-input"
                  onChange={(event) => setDraft(event.target.value)}
                  value={draft}
                />
              </FieldShell>
              <button
                aria-label="保存する"
                className="flex size-8 items-center justify-center rounded-md border border-border hover:bg-accent disabled:opacity-60"
                data-testid="save-workspace-slug"
                disabled={problem !== null}
                onClick={save}
                type="button"
              >
                <Check aria-hidden className="size-3.5" />
              </button>
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <code
                className="rounded-md bg-muted px-2 py-1 font-mono text-2xs"
                data-testid="workspace-host"
              >
                {workspaceHost(slug)}
              </code>
              <button
                aria-label="アドレスを変える"
                className="flex size-8 items-center justify-center rounded-md border border-border hover:bg-accent disabled:opacity-60"
                data-testid="edit-workspace-slug"
                disabled={update === null}
                onClick={() => {
                  setDraft(slug);
                  setEditing(true);
                }}
                type="button"
              >
                <Pencil aria-hidden className="size-3" />
              </button>
            </span>
          )}
        </SettingRow>

        {problem && (
          <p
            className="px-4 pb-3 text-badge text-destructive"
            data-testid="workspace-slug-problem"
          >
            {SLUG_PROBLEM_MESSAGES[problem]}
          </p>
        )}

        <p className="flex items-start gap-2 px-4 pb-3.5 text-badge text-muted-foreground">
          <Link2 aria-hidden className="mt-0.5 size-3 shrink-0" />
          {/* The question a rename actually raises, answered before it is asked. */}
          変えたあとも、前のアドレスは 90
          日間こちらへつながります。そのあいだ、空いた名前が他の Workspace
          に割り当てられることはありません。共有したリンクが別の組織の画面に着くほうが、つながらないより悪いからです。
        </p>
      </SettingCard>

      <div>
        <SettingGroupHeading>サインイン</SettingGroupHeading>
        <p className="mt-0.5 text-2xs text-muted-foreground">
          共通のアカウントは <code>{ACCOUNT_HOST}</code>{" "}
          で一度だけサインインし、 Workspace ごとに別のセッションを持ちます。
        </p>
      </div>

      <SettingCard testId="session-lifetimes">
        <SettingRow
          description="通常の操作に使う短い有効期限。切れると裏で更新されます。"
          testId="session-access"
          title="Access"
        >
          <span className="text-2xs">
            {formatLifetime(SESSION_LIFETIMES.accessSeconds)}
          </span>
        </SettingRow>
        <SettingRow
          description="更新のための有効期限。使うたびに新しいものへ置き換わります。"
          testId="session-refresh"
          title="Refresh"
        >
          <span className="text-2xs">
            {formatLifetime(SESSION_LIFETIMES.refreshSeconds)}
          </span>
        </SettingRow>
        <SettingRow
          description="ここを過ぎると、更新できていてもサインインし直しになります。"
          testId="session-absolute"
          title="絶対期限"
        >
          <span className="text-2xs">
            {formatLifetime(SESSION_LIFETIMES.absoluteSeconds)}
          </span>
        </SettingRow>
      </SettingCard>

      <SettingCard>
        <p className="px-4 py-3.5 text-badge text-muted-foreground">
          {/* Why there is no domain-wide cookie, on the screen that would be the
              natural place to add one. */}
          {usesSharedRootCookie()
            ? ""
            : "nuxx.ai 全体で共有する Cookie は置いていません。ひとつの Workspace で起きたことが、そのまま全部の Workspace の問題になるためです。"}
        </p>
      </SettingCard>
    </div>
  );
}
