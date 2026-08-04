import {
  channelRowMenuItems,
  type ChannelRowItem,
} from "@/features/channels/ui/channel-row-menu-items";
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/shared/ui/context-menu";
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/shared/ui/dropdown-menu";

/**
 * The per-channel actions, offered in both of the row's menus.
 *
 * Star and mute are local preferences (see `channel-flags`); leaving is a relay
 * command. The item list itself lives in `channel-row-menu-items.ts` so the two
 * menus cannot drift apart.
 *
 * Both are Radix now. The hand-rolled panel this replaced positioned itself with
 * `absolute right-1 top-full`, which put it off the bottom of the window for the
 * last room in a long sidebar, and re-implemented outside-click and Escape per
 * instance.
 */
export type ChannelRowMenuProps = Parameters<typeof channelRowMenuItems>[0];

/** Split so the destructive item can sit after a separator in both menus. */
function partition(items: ChannelRowItem[]) {
  return {
    normal: items.filter((item) => !item.destructive),
    destructive: items.filter((item) => item.destructive),
  };
}

/** The `⋯` button's menu. */
export function ChannelRowMenuContent(props: ChannelRowMenuProps) {
  const { normal, destructive } = partition(channelRowMenuItems(props));

  return (
    <DropdownMenuContent align="end" className="w-44">
      {normal.map((item) => (
        <DropdownMenuItem
          data-testid={`menu-${item.key}`}
          key={item.key}
          onSelect={item.onSelect}
        >
          <item.icon aria-hidden />
          {item.label}
        </DropdownMenuItem>
      ))}
      {destructive.length > 0 && <DropdownMenuSeparator />}
      {destructive.map((item) => (
        <DropdownMenuItem
          data-testid={`menu-${item.key}`}
          destructive
          key={item.key}
          onSelect={item.onSelect}
        >
          <item.icon aria-hidden />
          {item.label}
        </DropdownMenuItem>
      ))}
    </DropdownMenuContent>
  );
}

/**
 * The right-click menu.
 *
 * Its test ids are distinct from the dropdown's, because both are mounted for the
 * same row and a locator matching either would be ambiguous.
 */
export function ChannelRowContextMenuContent(props: ChannelRowMenuProps) {
  const { normal, destructive } = partition(channelRowMenuItems(props));

  return (
    <ContextMenuContent className="w-44">
      {normal.map((item) => (
        <ContextMenuItem
          data-testid={`context-${item.key}`}
          key={item.key}
          onSelect={item.onSelect}
        >
          <item.icon aria-hidden />
          {item.label}
        </ContextMenuItem>
      ))}
      {destructive.length > 0 && <ContextMenuSeparator />}
      {destructive.map((item) => (
        <ContextMenuItem
          data-testid={`context-${item.key}`}
          destructive
          key={item.key}
          onSelect={item.onSelect}
        >
          <item.icon aria-hidden />
          {item.label}
        </ContextMenuItem>
      ))}
    </ContextMenuContent>
  );
}
