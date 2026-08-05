import { MessageSquareHeart } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { SendFeedbackDialog } from "@/features/feedback/ui/SendFeedbackDialog";
import {
  deployedScriptUrl,
  loadedScriptUrl,
  updateState,
  type UpdateState,
} from "@/features/settings/update-check";
import { SettingCard, SettingRow } from "@/features/settings/ui/SettingRow";

const STATUS_TEXT: Record<UpdateState | "checking", string> = {
  checking: "確認しています…",
  current: "最新版です。",
  available: "新しいビルドが配信されています。適用するには読み込み直します。",
  unknown:
    "配信されているビルドを確認できませんでした。ネットワークが原因かもしれません。",
};

/**
 * Software updates.
 *
 * A web client has no download to apply — it updates when the page is reloaded — so
 * a "check for updates" button could easily be one that lies. But the question
 * behind it is real: this tab is running the bundle that was deployed when it was
 * opened, and a tab left open for a week is running last week's code.
 *
 * It is answered by comparing the entry script's content hash against the one the
 * server is serving right now, so "Update Now" reloads into something that is
 * genuinely different. See `update-check.ts`.
 *
 * Feedback lives here because it has no nav item of its own, and this is the screen
 * someone is on when they have something to say about the client.
 */
export function UpdatesPanel() {
  const [state, setState] = useState<UpdateState | "checking">("checking");
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  const check = useCallback(async () => {
    setState("checking");
    const loaded = loadedScriptUrl(
      [...document.querySelectorAll("script[src]")].map(
        (node) => (node as HTMLScriptElement).src,
      ),
    );
    try {
      // `no-store`, or the browser answers from the cache that served this very
      // page — which would report "up to date" forever.
      const response = await fetch(`${import.meta.env.BASE_URL}index.html`, {
        cache: "no-store",
      });
      setState(updateState(loaded, deployedScriptUrl(await response.text())));
    } catch {
      setState("unknown");
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  return (
    <div className="flex flex-col gap-6">
      <SettingCard>
        <SettingRow
          description={STATUS_TEXT[state]}
          testId="update-status-row"
          title="Update status"
        >
          {state === "available" ? (
            <button
              className="rounded-md bg-primary px-3 py-2 text-2xs font-medium text-primary-foreground hover:bg-primary/90"
              data-testid="update-now"
              onClick={() => window.location.reload()}
              type="button"
            >
              Update Now
            </button>
          ) : (
            <button
              className="rounded-md border border-border px-3 py-2 text-2xs font-medium hover:bg-accent disabled:opacity-60"
              data-testid="check-for-updates"
              disabled={state === "checking"}
              onClick={() => void check()}
              type="button"
            >
              確認する
            </button>
          )}
        </SettingRow>

        <SettingRow
          description="不具合を伝えるときは、この番号もいっしょに書いてください。"
          testId="version-row"
          title="バージョン"
        >
          <code
            className="select-all rounded-md bg-muted px-2 py-1 font-mono text-2xs"
            data-testid="app-version"
          >
            v{__APP_VERSION__}
          </code>
        </SettingRow>
      </SettingCard>

      <SettingCard>
        <SettingRow
          description="このリレーを運用している人に直接届きます。チャンネルには流れません。"
          title="フィードバック"
        >
          <button
            className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-2xs font-medium hover:bg-accent"
            data-testid="open-feedback"
            onClick={() => setFeedbackOpen(true)}
            type="button"
          >
            <MessageSquareHeart aria-hidden className="size-3" />
            送る
          </button>
        </SettingRow>
      </SettingCard>

      <SendFeedbackDialog
        onClose={() => setFeedbackOpen(false)}
        open={feedbackOpen}
      />
    </div>
  );
}
