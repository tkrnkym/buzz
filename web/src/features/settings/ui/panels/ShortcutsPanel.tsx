import { keyChips, SHORTCUT_GROUPS } from "@/features/settings/shortcuts";
import {
  SettingCard,
  SettingGroupHeading,
  SettingRow,
} from "@/features/settings/ui/SettingRow";

/** One key, drawn as a key. */
function Key({ children }: { children: string }) {
  return (
    <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-sans text-2xs font-medium text-foreground">
      {children}
    </kbd>
  );
}

/**
 * Shortcuts: what the keyboard reaches.
 *
 * A list, not a rebinding screen. The handlers live in the components they belong to
 * — Enter sends in the composer you are typing in, Esc closes the dialog you are in
 * — so a rebinding control would have to promise something the app cannot do yet.
 * Saying that is better than showing a control that silently fails.
 *
 * The scope column is why this is worth a screen at all: the same key does different
 * things in different places, and a shortcut that "does not work" is almost always
 * one being pressed somewhere it does not apply.
 */
export function ShortcutsPanel() {
  return (
    <div className="flex flex-col gap-6">
      {SHORTCUT_GROUPS.map((group) => (
        <div className="flex flex-col gap-3" key={group.label}>
          <SettingGroupHeading>{group.label}</SettingGroupHeading>
          <SettingCard testId={`shortcuts-${group.label}`}>
            {group.items.map((shortcut) => (
              <SettingRow
                description={shortcut.scope}
                key={`${group.label}-${shortcut.action}-${shortcut.keys.join("+")}`}
                title={shortcut.action}
              >
                <span className="flex items-center gap-1">
                  {keyChips(shortcut).map((chip) => (
                    <span className="flex items-center gap-1" key={chip.key}>
                      {chip.plus && (
                        <span className="text-2xs text-muted-foreground">
                          +
                        </span>
                      )}
                      <Key>{chip.label}</Key>
                    </span>
                  ))}
                </span>
              </SettingRow>
            ))}
          </SettingCard>
        </div>
      ))}

      <p className="text-2xs text-muted-foreground">
        いまは割り当ての変更に対応していません。各操作はそれぞれの画面が受け持っているため、変更できる作りになっていないからです。
      </p>
    </div>
  );
}
