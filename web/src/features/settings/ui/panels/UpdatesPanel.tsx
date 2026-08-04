import { SettingCard, SettingRow } from "@/features/settings/ui/SettingRow";
import { SendFeedbackDialog } from "@/features/feedback/ui/SendFeedbackDialog";
import { MessageSquareHeart } from "lucide-react";
import { useState } from "react";

/**
 * Updates: which version is running.
 *
 * No "check for updates" button, deliberately. A web client updates when the page is
 * reloaded — there is nothing to check and nothing to download, so a button would
 * either lie or do nothing. What a reader actually needs from this screen is the
 * version to quote when reporting something, and a way to report it.
 *
 * Feedback lives here for that reason: it has no nav item of its own, and this is the
 * screen someone is on when they have something to say about the client.
 */
export function UpdatesPanel() {
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <SettingCard>
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

        <SettingRow
          description="ブラウザで動くので、ページを読み込み直した時点で最新になります。ダウンロードするものはありません。"
          title="更新のしかた"
        >
          <button
            className="rounded-md border border-border px-2.5 py-1.5 text-2xs font-medium hover:bg-accent"
            data-testid="reload-app"
            onClick={() => window.location.reload()}
            type="button"
          >
            読み込み直す
          </button>
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
