import { createFileRoute } from "@tanstack/react-router";

import { ProfileStoreProvider } from "@/features/profile/profile-store";
import { SettingsPage } from "@/features/settings/ui/SettingsPage";
import { ShowcaseStoreProvider } from "@/features/showcase/showcase-store";
import { RelaySessionProvider } from "@/shared/api/relay-provider";

/**
 * One settings screen, outside the app shell.
 *
 * Its own providers rather than the shell's, for the same reason `/welcome` has
 * its own: these screens need a relay session (publishing a profile, uploading an
 * emoji), the profile cache, and the demo fixtures — and none of the shell's read
 * cursors, unread snapshots or presence heartbeat, which exist to serve a timeline
 * that is not on screen.
 */
export const Route = createFileRoute("/settings/$panel")({
  component: SettingsRoute,
});

function SettingsRoute() {
  const { panel } = Route.useParams();
  return (
    <RelaySessionProvider>
      <ProfileStoreProvider>
        <ShowcaseStoreProvider>
          <SettingsPage panel={panel} />
        </ShowcaseStoreProvider>
      </ProfileStoreProvider>
    </RelaySessionProvider>
  );
}
