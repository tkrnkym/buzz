import * as TabsPrimitive from "@radix-ui/react-tabs";
import * as React from "react";

import { cn } from "@/shared/lib/cn";

/**
 * Tabs.
 *
 * For a control that swaps which panel is shown. Not for a segmented filter that
 * narrows one list — those keep their buttons, because calling them tabs would
 * promise a keyboard user that arrow keys move between panels when there is only
 * one.
 *
 * What the primitive is doing: `role="tablist"`/`tab`/`tabpanel` with
 * `aria-controls` wired both ways, and roving focus so the list is one tab stop
 * and the arrow keys move within it. The hand-rolled versions of this in the app
 * were rows of independent buttons — every one a tab stop, with no relationship
 * to the panel they controlled, and in one case claiming `role="tab"` without any
 * of the behaviour it implies.
 *
 * Ported from the desktop client (commit 02749b3^), restyled to the app's own
 * segmented look rather than the shadcn default so the converted rows keep
 * appearing as they did.
 */
const Tabs = TabsPrimitive.Root;

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    className={cn("inline-flex items-center gap-1", className)}
    ref={ref}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    className={cn(
      "whitespace-nowrap rounded-md px-2.5 py-1 text-2xs font-medium text-muted-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-secondary data-[state=active]:text-secondary-foreground",
      className,
    )}
    ref={ref}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    className={cn(
      "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
      className,
    )}
    ref={ref}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsContent, TabsList, TabsTrigger };
