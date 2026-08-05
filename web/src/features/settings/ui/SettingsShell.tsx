import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

import {
  SETTINGS_GROUPS,
  type SettingsPanel,
} from "@/features/settings/settings-nav";
import { cn } from "@/shared/lib/cn";

/**
 * The settings window.
 *
 * Its own surface, not a page in the app shell — see `settings-nav.ts`. The nav is
 * a column of links rather than buttons over component state, which is what makes
 * every screen linkable and the browser's back button work through the fifteen of
 * them.
 *
 * The version sits at the bottom of the nav. It is the one thing on this surface
 * nobody looks for until something is wrong, and then it is the first thing they
 * are asked for.
 */
export function SettingsShell({
  children,
  panel,
}: {
  children: ReactNode;
  panel: SettingsPanel;
}) {
  return (
    <div className="flex h-dvh min-h-0 bg-background text-foreground">
      <nav
        aria-label="Settings"
        className="flex w-64 shrink-0 flex-col overflow-y-auto border-r border-border bg-sidebar/60 px-3 py-4"
        data-testid="settings-nav"
      >
        {/* One way back, at the top of the nav where the app was. A close button
            in the corner would leave the reader guessing what it closes to. */}
        <Link
          className="mb-4 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          data-testid="settings-back"
          to="/"
        >
          <ArrowLeft aria-hidden className="size-4" />
          Back to app
        </Link>

        {SETTINGS_GROUPS.map((group) => (
          <div className="mb-4 flex flex-col gap-0.5" key={group.label}>
            <p className="px-2 pb-1 text-2xs font-medium text-muted-foreground">
              {group.label}
            </p>
            {group.items.map((item) => {
              const active = item.id === panel.id;
              return (
                <Link
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors",
                    active
                      ? "bg-primary font-medium text-primary-foreground"
                      : "text-foreground hover:bg-accent",
                  )}
                  data-testid={`settings-nav-${item.id}`}
                  key={item.id}
                  params={{ panel: item.id }}
                  to="/settings/$panel"
                >
                  <item.Icon aria-hidden className="size-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}

        <p
          className="mt-auto px-2 pt-4 text-2xs text-muted-foreground"
          data-testid="settings-version"
        >
          v{__APP_VERSION__}
        </p>
      </nav>

      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-6 px-8 py-8">
          <header>
            {/* The heading, which is allowed to be longer than the nav row it
                came from — "Compute" in a list of fifteen, "Share compute" here. */}
            <h1 className="text-2xl font-semibold">
              {panel.title ?? panel.label}
            </h1>
            {/* One line, under the title. Every screen has one: a heading alone
                does not say what changing the thing below it will do. */}
            <p className="mt-1 text-sm text-muted-foreground">
              {panel.description}
            </p>
          </header>
          {children}
        </div>
      </main>
    </div>
  );
}
