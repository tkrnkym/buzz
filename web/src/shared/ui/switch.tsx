import * as SwitchPrimitives from "@radix-ui/react-switch";
import * as React from "react";

import { cn } from "@/shared/lib/cn";

/**
 * A switch.
 *
 * Not interchangeable with `checkbox.tsx`, and the distinction is the reason both
 * exist: a checkbox means "include this in a set", settled when the form is
 * submitted, while a switch means "this is on", taking effect immediately. The
 * settings panels toggle live preferences with no Save button, so they are
 * switches; the create-workflow form's "run it once created" is part of what gets
 * submitted, so it is a checkbox.
 *
 * Ported from the desktop client (commit 02749b3^).
 */
const Switch = React.forwardRef<
  React.ComponentRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input",
      className,
    )}
    ref={ref}
    {...props}
  >
    <SwitchPrimitives.Thumb className="pointer-events-none block size-4 rounded-full bg-background transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0" />
  </SwitchPrimitives.Root>
));
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
