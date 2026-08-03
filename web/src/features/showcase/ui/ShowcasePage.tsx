import type { ReactNode } from "react";
import { PlugZap } from "lucide-react";

import { cn } from "@/shared/lib/cn";
import { SidebarTrigger } from "@/shared/ui/sidebar";

/**
 * The frame every mock-up screen sits in.
 *
 * One component rather than a header copied into eight files: these screens are
 * the parts of the app most likely to be replaced wholesale once they have real
 * data, and a shared frame is what keeps that a per-screen job.
 */
export function ShowcasePage({
  actions,
  children,
  contentClassName,
  subtitle,
  title,
}: {
  actions?: ReactNode;
  children: ReactNode;
  contentClassName?: string;
  subtitle?: string;
  title: string;
}) {
  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <SidebarTrigger className="md:-ml-1" />
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold">{title}</h1>
            {subtitle && (
              <p className="truncate text-2xs text-muted-foreground">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {actions}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div
          className={cn("mx-auto w-full max-w-4xl px-4 py-6", contentClassName)}
        >
          {children}
        </div>
      </div>
    </section>
  );
}

/**
 * What a mock-up screen shows when it has no data.
 *
 * Says plainly that the screen is not connected rather than rendering an empty
 * list, which would read as "you have no projects" — a different and false
 * claim.
 */
export function NotWiredUp({ what }: { what: string }) {
  return (
    <div
      className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-6 py-12 text-center"
      data-testid="showcase-not-wired"
    >
      <PlugZap aria-hidden className="size-6 text-muted-foreground" />
      <div>
        <p className="text-sm font-medium">{what}はまだ接続されていません</p>
        <p className="mt-1 max-w-md text-2xs text-muted-foreground">
          画面はできていますが、このクライアントにはリレーからデータを読む経路が
          まだありません。デモビルドではサンプルデータで動きを確認できます。
        </p>
      </div>
    </div>
  );
}
