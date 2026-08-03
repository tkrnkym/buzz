import { createFileRoute } from "@tanstack/react-router";

import { OnboardingFlow } from "@/features/onboarding/ui/OnboardingFlow";
import { ProfileStoreProvider } from "@/features/profile/profile-store";
import { RelaySessionProvider } from "@/shared/api/relay-provider";

/**
 * First-run onboarding, outside the app shell but with its own relay session.
 *
 * It needs two of the shell's providers and none of its chrome. The profile step
 * publishes a kind:0 and the avatar step uploads to the relay's media host, so a
 * session and the profile store are both required — but someone still deciding
 * whether to install a signer should not be met by a sidebar of empty channels and
 * read cursors for rooms they have never seen.
 *
 * Its own providers rather than hoisting the shell's to the root, because this is a
 * page someone passes through once. Hoisting would open a socket for every visitor
 * to `/repos` and `/invite` too, neither of which needs one.
 */
export const Route = createFileRoute("/welcome")({
  component: WelcomeRoute,
});

function WelcomeRoute() {
  return (
    <RelaySessionProvider>
      <ProfileStoreProvider>
        <OnboardingFlow />
      </ProfileStoreProvider>
    </RelaySessionProvider>
  );
}
