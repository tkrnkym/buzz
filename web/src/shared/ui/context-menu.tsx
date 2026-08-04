import * as ContextMenuPrimitive from "@radix-ui/react-context-menu";
import { Check } from "lucide-react";
import * as React from "react";

import { cn } from "@/shared/lib/cn";

/**
 * A right-click menu.
 *
 * The affordance the web client had no way to offer. A row's actions were reachable
 * only through a button that appears on hover, which is a mouse-only path with no
 * keyboard equivalent and nothing at all on a trackpad two-finger tap. Radix gives
 * the pointer event handling — long-press on touch, `Shift+F10` and the menu key
 * from the keyboard — none of which is worth hand-rolling per row.
 *
 * This does not replace `dropdown-menu.tsx`. A row usually wants both: the same
 * items reachable by right-click and by a visible button, since a context menu is
 * discoverable only by people who already expect it.
 *
 * Ported from the desktop client (commit 02749b3^), minus the submenu parts for
 * the same reason the dropdown skipped them.
 */
/**
 * No exit animation, deliberately.
 *
 * Radix keeps a closing panel mounted until its CSS animation ends. When the
 * action behind a selected item re-renders the tree — which is the normal case,
 * since that is what the item is for — the animation is interrupted and never
 * reports `animationend`, so the panel and its dismissable layer are never
 * removed. The stale layer then treats the next open as an outside click and
 * closes it instantly, leaving a control that works exactly once. Entry
 * animations are safe: nothing is waiting on them to unmount anything.
 */
const ContextMenu = ContextMenuPrimitive.Root;
const ContextMenuTrigger = ContextMenuPrimitive.Trigger;
const ContextMenuGroup = ContextMenuPrimitive.Group;

const ContextMenuContent = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Content>
>(({ className, ...props }, ref) => (
  <ContextMenuPrimitive.Portal>
    <ContextMenuPrimitive.Content
      className={cn(
        "z-50 min-w-40 overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95 origin-(--radix-context-menu-content-transform-origin)",
        className,
      )}
      ref={ref}
      {...props}
    />
  </ContextMenuPrimitive.Portal>
));
ContextMenuContent.displayName = ContextMenuPrimitive.Content.displayName;

const ITEM_CLASS =
  "relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0";

const ContextMenuItem = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Item> & {
    destructive?: boolean;
  }
>(({ className, destructive, ...props }, ref) => (
  <ContextMenuPrimitive.Item
    className={cn(
      ITEM_CLASS,
      destructive && "text-destructive focus:text-destructive",
      className,
    )}
    ref={ref}
    {...props}
  />
));
ContextMenuItem.displayName = ContextMenuPrimitive.Item.displayName;

const ContextMenuCheckboxItem = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.CheckboxItem>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.CheckboxItem>
>(({ children, className, ...props }, ref) => (
  <ContextMenuPrimitive.CheckboxItem
    className={cn(ITEM_CLASS, "pl-7", className)}
    ref={ref}
    {...props}
  >
    <span className="absolute left-2 flex size-3.5 items-center justify-center">
      <ContextMenuPrimitive.ItemIndicator>
        <Check aria-hidden className="size-3.5" />
      </ContextMenuPrimitive.ItemIndicator>
    </span>
    {children}
  </ContextMenuPrimitive.CheckboxItem>
));
ContextMenuCheckboxItem.displayName =
  ContextMenuPrimitive.CheckboxItem.displayName;

const ContextMenuLabel = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Label>
>(({ className, ...props }, ref) => (
  <ContextMenuPrimitive.Label
    className={cn(
      "px-2 py-1.5 text-2xs font-medium text-muted-foreground",
      className,
    )}
    ref={ref}
    {...props}
  />
));
ContextMenuLabel.displayName = ContextMenuPrimitive.Label.displayName;

const ContextMenuSeparator = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <ContextMenuPrimitive.Separator
    className={cn("-mx-1 my-1 h-px bg-border", className)}
    ref={ref}
    {...props}
  />
));
ContextMenuSeparator.displayName = ContextMenuPrimitive.Separator.displayName;

export {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
};
