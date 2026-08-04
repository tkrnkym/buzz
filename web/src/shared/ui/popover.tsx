import * as PopoverPrimitive from "@radix-ui/react-popover";
import * as React from "react";

import { cn } from "@/shared/lib/cn";
import { useDialogContainer } from "@/shared/ui/dialog";

/**
 * An anchored panel that is not a menu.
 *
 * `dropdown-menu.tsx` is for a list of choices, with roving focus and typeahead;
 * this is for a panel with its own contents — a picker, a form, a preview — where
 * arrow keys belong to whatever is inside it.
 *
 * What it buys over `absolute` positioning on a wrapper, which is how the emoji
 * picker used to be placed: the panel is portalled, so a scrolling ancestor
 * cannot clip it, and it is collision-aware, so it flips instead of opening off
 * the edge of the viewport. Both of those were real for the reaction picker on
 * the last message in a channel.
 *
 * Ported from the desktop client (commit 02749b3^), with its separate
 * `popoverSurface` constants folded in — there is one popover surface here, so a
 * second module to hold its four class strings would be indirection.
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
const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;
const PopoverAnchor = PopoverPrimitive.Anchor;

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ align = "center", className, sideOffset = 4, ...props }, ref) => {
  // Same top-layer problem as the dropdown: inside a native modal dialog the
  // panel has to be a descendant of the dialog or it paints underneath it. See
  // `useDialogContainer`.
  const container = useDialogContainer();

  return (
    <PopoverPrimitive.Portal container={container}>
      <PopoverPrimitive.Content
        align={align}
        className={cn(
          "z-50 rounded-xl border border-border bg-popover p-4 text-popover-foreground shadow-md outline-none animate-in fade-in-0 zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 origin-(--radix-popover-content-transform-origin)",
          className,
        )}
        ref={ref}
        sideOffset={sideOffset}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
});
PopoverContent.displayName = PopoverPrimitive.Content.displayName;

export { Popover, PopoverAnchor, PopoverContent, PopoverTrigger };
