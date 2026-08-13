import { KeyRound, Trash2, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { formatRelativeTime } from "@/features/agents/agent-model";
import {
  SettingCard,
  SettingGroupHeading,
  SettingRow,
} from "@/features/settings/ui/SettingRow";
import { NotWiredUp } from "@/features/showcase/ui/ShowcasePage";
import {
  nextMockId,
  useShowcase,
  useShowcaseUpdate,
} from "@/features/showcase/use-showcase";
import type { ShowcaseSecret } from "@/mock/showcase";
import { Dialog } from "@/shared/ui/dialog";
import { FIELD_CONTROL_CLASS, FieldShell } from "@/shared/ui/field-row";

/**
 * The secrets vault.
 *
 * A resource is configured with a secret's *id*, never its value. The runtime
 * injects the value for the duration of one operation and it never reaches the
 * relay, a log, an agent's input, or an artefact — which is why nothing on this
 * screen can reveal one: there is no value in the model to reveal.
 *
 * That includes for the workspace owner. A vault whose administrator can read
 * every credential back out is a vault with one more copy of every credential
 * in it, and "who can see this" stops being answerable. Rotation replaces a
 * secret; nothing reads one.
 *
 * Workspace secrets and personal connections are listed apart because they
 * answer to different people. A personal token stops working when its owner
 * leaves, and a workspace one does not — presenting them as one list is how a
 * workflow ends up depending on someone's individual account.
 */
export function SecretsPanel() {
  const showcase = useShowcase();
  const update = useShowcaseUpdate();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<ShowcaseSecret | null>(
    null,
  );

  if (!showcase) return <NotWiredUp what="Secrets" />;

  const workspace = showcase.secrets.filter((row) => row.scope === "workspace");
  const personal = showcase.secrets.filter((row) => row.scope === "personal");

  const save = () => {
    const trimmed = name.trim();
    if (!trimmed || !value.trim()) return;
    update?.((current) => ({
      ...current,
      secrets: [
        ...current.secrets,
        {
          id: nextMockId("sec"),
          name: trimmed,
          scope: "workspace",
          lastUsedBy: null,
          lastUsedAt: null,
          createdAt: Math.floor(Date.now() / 1000),
          referenceCount: 0,
        },
      ],
    }));
    // The value is deliberately dropped here rather than stored: this is the
    // point past which it is not readable, and the model has nowhere to put it.
    setName("");
    setValue("");
    setAdding(false);
    toast.success(`${trimmed} を保存しました。値はもう表示できません。`);
  };

  return (
    <div className="flex flex-col gap-6">
      <SettingCard>
        <p className="flex items-start gap-2 px-4 py-3.5 text-2xs text-muted-foreground">
          <KeyRound aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          <span>
            リソースには秘密の値ではなく
            <span className="font-medium text-foreground">Secret の名前</span>
            だけを設定します。値は実行時に必要な処理へ一時的に渡されるだけで、リレー・ログ・エージェントの入力・成果物のいずれにも出ません。
            <br />
            登録した値は、この Workspace の Owner
            であっても後から読み出せません。読み出せる保管庫は、資格情報の写しがもう一つあるのと同じだからです。
          </span>
        </p>
      </SettingCard>

      <div className="flex items-center justify-between gap-3">
        <SettingGroupHeading>Workspace Secrets</SettingGroupHeading>
        <button
          className="rounded-md border border-border px-2.5 py-1.5 text-2xs font-medium hover:bg-accent disabled:opacity-60"
          data-testid="add-secret"
          disabled={update === null}
          onClick={() => setAdding(true)}
          type="button"
        >
          追加する
        </button>
      </div>

      <SettingCard testId="workspace-secrets">
        {workspace.length === 0 && (
          <p className="px-4 py-3.5 text-2xs text-muted-foreground">
            まだありません。
          </p>
        )}
        {workspace.map((secret) => (
          <SecretRow
            key={secret.id}
            onDelete={() => setConfirmDelete(secret)}
            secret={secret}
          />
        ))}
      </SettingCard>

      <div>
        <SettingGroupHeading>Personal Connections</SettingGroupHeading>
        <p className="mt-0.5 text-2xs text-muted-foreground">
          あなた個人のアカウントに紐づくもの。あなたが抜けると止まります。ワークフローの依存先には向きません。
        </p>
      </div>

      <SettingCard testId="personal-secrets">
        {personal.length === 0 && (
          <p className="px-4 py-3.5 text-2xs text-muted-foreground">
            まだありません。
          </p>
        )}
        {personal.map((secret) => (
          <SecretRow
            key={secret.id}
            onDelete={() => setConfirmDelete(secret)}
            secret={secret}
          />
        ))}
      </SettingCard>

      {adding && (
        <Dialog
          description="名前は、エージェントやワークフローから参照するときに書く文字列です。値はここで一度だけ入力します。"
          footer={
            <>
              <button
                className="rounded-md px-3 py-1.5 text-2xs font-medium text-muted-foreground hover:text-foreground"
                onClick={() => setAdding(false)}
                type="button"
              >
                やめる
              </button>
              <button
                className="rounded-md bg-primary px-3 py-1.5 text-2xs font-medium text-primary-foreground disabled:opacity-60"
                data-testid="save-secret"
                disabled={!name.trim() || !value.trim()}
                onClick={save}
                type="button"
              >
                保存する
              </button>
            </>
          }
          onClose={() => setAdding(false)}
          open
          testId="secret-dialog"
          title="Secret を追加"
        >
          <div className="flex flex-col gap-3">
            <FieldShell className="px-3 py-2">
              <input
                aria-label="名前"
                className={FIELD_CONTROL_CLASS}
                data-testid="secret-name"
                onChange={(event) => setName(event.target.value)}
                placeholder="ANTHROPIC_API_KEY"
                value={name}
              />
            </FieldShell>
            <FieldShell className="px-3 py-2">
              <input
                aria-label="値"
                className={FIELD_CONTROL_CLASS}
                data-testid="secret-value"
                onChange={(event) => setValue(event.target.value)}
                placeholder="値を貼り付け"
                // `password`, so it is not shoulder-read or captured by a
                // screen recording while it is being pasted in.
                type="password"
                value={value}
              />
            </FieldShell>
            <p className="flex items-start gap-1.5 text-badge text-muted-foreground">
              <TriangleAlert aria-hidden className="mt-0.5 size-3 shrink-0" />
              保存すると、この値は誰の画面にも二度と表示されません。差し替えたいときは新しい値で上書きします。
            </p>
          </div>
        </Dialog>
      )}

      {confirmDelete && (
        <Dialog
          description={
            confirmDelete.referenceCount > 0
              ? `「${confirmDelete.name}」は ${confirmDelete.referenceCount} 箇所から参照されています。削除すると、それらは次の実行で失敗します。`
              : `「${confirmDelete.name}」を削除します。参照しているものはありません。`
          }
          footer={
            <>
              <button
                className="rounded-md px-3 py-1.5 text-2xs font-medium text-muted-foreground hover:text-foreground"
                onClick={() => setConfirmDelete(null)}
                type="button"
              >
                やめる
              </button>
              <button
                className="rounded-md bg-destructive px-3 py-1.5 text-2xs font-medium text-destructive-foreground"
                data-testid="confirm-delete-secret"
                onClick={() => {
                  update?.((current) => ({
                    ...current,
                    secrets: current.secrets.filter(
                      (row) => row.id !== confirmDelete.id,
                    ),
                  }));
                  setConfirmDelete(null);
                  toast.success("削除しました");
                }}
                type="button"
              >
                削除する
              </button>
            </>
          }
          onClose={() => setConfirmDelete(null)}
          open
          testId="delete-secret-dialog"
          title="Secret を削除"
        >
          <p className="text-2xs text-muted-foreground">値は復元できません。</p>
        </Dialog>
      )}
    </div>
  );
}

function SecretRow({
  onDelete,
  secret,
}: {
  onDelete: () => void;
  secret: ShowcaseSecret;
}) {
  const nowSeconds = Math.floor(Date.now() / 1000);

  return (
    <SettingRow
      description={
        <span className="flex flex-wrap items-center gap-x-3">
          {/* No value, and no masked stand-in for one either: "••••••••" implies
              there is something here to reveal, and there is not. */}
          <span>
            {secret.referenceCount > 0
              ? `${secret.referenceCount} 箇所から参照`
              : "参照しているものはありません"}
          </span>
          <span>
            {secret.lastUsedAt === null
              ? "未使用"
              : `最終使用 ${formatRelativeTime(secret.lastUsedAt, nowSeconds)}${
                  secret.lastUsedBy ? ` · ${secret.lastUsedBy}` : ""
                }`}
          </span>
        </span>
      }
      testId={`secret-${secret.id}`}
      title={secret.name}
    >
      <button
        aria-label={`${secret.name} を削除`}
        className="flex size-7 items-center justify-center rounded-md border border-border text-destructive hover:bg-destructive/10"
        data-testid={`delete-secret-${secret.id}`}
        onClick={onDelete}
        type="button"
      >
        <Trash2 aria-hidden className="size-3" />
      </button>
    </SettingRow>
  );
}
