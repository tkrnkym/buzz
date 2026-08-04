import { ArrowLeft, ChevronRight, Link2, Plus, Server } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  extractInviteCode,
  inviteCodeError,
  normalizeRelayUrl,
  relayUrlError,
} from "@/features/communities/community-model";
import { Dialog } from "@/shared/ui/dialog";

const FIELD_CLASS =
  "h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

type Mode = "choose" | "join" | "connect";

function Choice({
  description,
  Icon,
  label,
  onClick,
  testId,
}: {
  description: string;
  Icon: typeof Link2;
  label: string;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      className="flex w-full items-center gap-3 rounded-lg border border-border px-3 py-3 text-left transition-colors hover:bg-accent"
      data-testid={testId}
      onClick={onClick}
      type="button"
    >
      <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-badge text-muted-foreground">
          {description}
        </span>
      </span>
      <ChevronRight
        aria-hidden
        className="size-4 shrink-0 text-muted-foreground"
      />
    </button>
  );
}

/**
 * Adding a community: join one, connect to a relay, or create a hosted one.
 *
 * Three doors behind one button, because they are genuinely different situations
 * and merging them produces a form where two thirds of the fields are irrelevant.
 * "Join with an invite" is first: it is what almost everyone arriving here is
 * doing, and the other two are for people who already know which they want.
 *
 * The invite field accepts a pasted link as well as a bare code. Asking someone to
 * edit a URL down to its last path segment is a step that exists only because the
 * client would not do it.
 */
export function AddCommunityDialog({
  onClose,
  onCreateHosted,
  open,
}: {
  onClose: () => void;
  /**
   * Hand off to the setup flow.
   *
   * Not a fourth mode of this dialog. Creating a hosted community is three
   * decisions on its own light surface, and a `<dialog>` opened with
   * `showModal()` sits in the browser's top layer — a full-window flow inside it
   * cannot be scrolled past on a short viewport. The caller closes this and opens
   * that instead.
   */
  onCreateHosted: () => void;
  open: boolean;
}) {
  const [mode, setMode] = useState<Mode>("choose");
  const [invite, setInvite] = useState("");
  const [relayUrl, setRelayUrl] = useState("");

  const close = () => {
    onClose();
    setMode("choose");
    setInvite("");
    setRelayUrl("");
  };

  if (!open) return null;

  const inviteError = invite
    ? inviteCodeError(extractInviteCode(invite))
    : null;
  const urlError = relayUrl ? relayUrlError(relayUrl) : null;

  const back = (
    <button
      className="flex items-center gap-1 rounded-md px-2 py-1.5 text-2xs text-muted-foreground hover:text-foreground"
      data-testid="add-community-back"
      onClick={() => setMode("choose")}
      type="button"
    >
      <ArrowLeft aria-hidden className="size-3" />
      戻る
    </button>
  );

  const submit = (label: string, ok: boolean, testId: string) => (
    <button
      className="rounded-md bg-primary px-3 py-1.5 text-2xs font-medium text-primary-foreground disabled:opacity-60"
      data-testid={testId}
      disabled={!ok}
      onClick={() => {
        toast.success(`${label}（この画面はモックなので実際には繋ぎません）`);
        close();
      }}
      type="button"
    >
      {label}
    </button>
  );

  return (
    <Dialog
      description={
        mode === "choose"
          ? "参加するか、リレーに直接つなぐか、新しく用意するかを選びます。"
          : undefined
      }
      footer={
        mode === "choose" ? undefined : (
          <>
            {back}
            {mode === "join" &&
              submit("参加する", !!invite && !inviteError, "join-community")}
            {mode === "connect" &&
              submit("つなぐ", !!relayUrl && !urlError, "connect-community")}
          </>
        )
      }
      onClose={close}
      open
      testId="add-community-dialog"
      title={
        mode === "choose"
          ? "コミュニティを追加"
          : mode === "join"
            ? "招待で参加する"
            : "リレーにつなぐ"
      }
    >
      {mode === "choose" && (
        <div className="flex flex-col gap-2">
          <Choice
            Icon={Link2}
            description="もらった招待コードやリンクを使います。"
            label="招待で参加する"
            onClick={() => setMode("join")}
            testId="choose-join"
          />
          <Choice
            Icon={Server}
            description="自分たちで動かしているリレーのURLを指定します。"
            label="リレーにつなぐ"
            onClick={() => setMode("connect")}
            testId="choose-connect"
          />
          <Choice
            Icon={Plus}
            description="サーバを用意せずに、新しいコミュニティを立ち上げます。"
            label="ホスト型を作る"
            onClick={() => {
              close();
              onCreateHosted();
            }}
            testId="choose-create"
          />
        </div>
      )}

      {mode === "join" && (
        <label className="flex flex-col gap-1">
          <span className="text-2xs font-medium text-muted-foreground">
            招待コード、または招待リンク
          </span>
          <input
            className={FIELD_CLASS}
            data-testid="invite-input"
            onChange={(event) => setInvite(event.target.value)}
            placeholder="https://… または コード"
            value={invite}
          />
          {invite && !inviteError && (
            <span className="text-badge text-muted-foreground">
              コード: <code>{extractInviteCode(invite)}</code>
            </span>
          )}
          {inviteError && (
            <span className="text-badge text-destructive">{inviteError}</span>
          )}
        </label>
      )}

      {mode === "connect" && (
        <label className="flex flex-col gap-1">
          <span className="text-2xs font-medium text-muted-foreground">
            リレーのURL
          </span>
          <input
            className={FIELD_CLASS}
            data-testid="relay-url-input"
            onChange={(event) => setRelayUrl(event.target.value)}
            placeholder="relay.example.jp"
            value={relayUrl}
          />
          {relayUrl && !urlError && (
            // Shown because the normalization is not obvious: someone who typed a
            // bare host should see that it became wss:// before they connect.
            <span className="text-badge text-muted-foreground">
              つなぐ先: <code>{normalizeRelayUrl(relayUrl)}</code>
            </span>
          )}
          {urlError && (
            <span className="text-badge text-destructive">{urlError}</span>
          )}
        </label>
      )}
    </Dialog>
  );
}

/**
 * Editing a community's name and relay URL.
 *
 * The URL is editable because a relay can move, and a community whose address is
 * frozen at the moment it was added would have to be removed and re-added — losing
 * its position in the rail and every local preference attached to it.
 */
export function EditCommunityDialog({
  initialName,
  initialRelayUrl,
  onClose,
  open,
}: {
  initialName: string;
  initialRelayUrl: string;
  onClose: () => void;
  open: boolean;
}) {
  const [name, setName] = useState(initialName);
  const [relayUrl, setRelayUrl] = useState(initialRelayUrl);

  if (!open) return null;
  const urlError = relayUrlError(relayUrl);

  return (
    <Dialog
      description="名前はこの端末での表示に使われます。リレーのURLを変えると、つなぎ直します。"
      footer={
        <>
          <button
            className="rounded-md px-3 py-1.5 text-2xs font-medium text-muted-foreground hover:text-foreground"
            onClick={onClose}
            type="button"
          >
            キャンセル
          </button>
          <button
            className="rounded-md bg-primary px-3 py-1.5 text-2xs font-medium text-primary-foreground disabled:opacity-60"
            data-testid="save-community"
            disabled={!name.trim() || urlError !== null}
            onClick={() => {
              toast.success("保存しました（この画面はモックです）");
              onClose();
            }}
            type="button"
          >
            保存する
          </button>
        </>
      }
      onClose={onClose}
      open
      testId="edit-community-dialog"
      title="コミュニティを編集"
    >
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-2xs font-medium text-muted-foreground">
            名前
          </span>
          <input
            className={FIELD_CLASS}
            data-testid="community-name-input"
            onChange={(event) => setName(event.target.value)}
            value={name}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-2xs font-medium text-muted-foreground">
            リレーのURL
          </span>
          <input
            className={FIELD_CLASS}
            data-testid="community-relay-input"
            onChange={(event) => setRelayUrl(event.target.value)}
            value={relayUrl}
          />
          {urlError && (
            <span className="text-badge text-destructive">{urlError}</span>
          )}
        </label>
      </div>
    </Dialog>
  );
}
