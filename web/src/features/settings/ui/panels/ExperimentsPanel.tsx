import { SettingCard, SettingRow } from "@/features/settings/ui/SettingRow";
import { useFeatureFlags } from "@/features/settings/use-feature-flags";
import { FEATURE_FLAGS } from "@/features/settings/feature-flags";
import { Switch } from "@/shared/ui/switch";

/**
 * Experiments.
 *
 * Every switch here removes or restores a section of the app — its sidebar row and
 * its route — so turning one off does something the reader can see immediately. A
 * list of flags nothing reads would be the same mistake this codebase already made
 * with the theme tokens.
 */
export function ExperimentsPanel() {
  const { flags, setFlag } = useFeatureFlags();

  return (
    <SettingCard testId="experiments">
      {FEATURE_FLAGS.map((flag) => (
        <SettingRow
          description={flag.description}
          key={flag.id}
          testId={`experiment-row-${flag.id}`}
          title={flag.label}
        >
          <Switch
            checked={flags[flag.id]}
            data-testid={`experiment-${flag.id}`}
            onCheckedChange={(next) => setFlag(flag.id, next)}
          />
        </SettingRow>
      ))}
    </SettingCard>
  );
}
