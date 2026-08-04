import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check } from "lucide-react";
import * as React from "react";

import { cn } from "@/shared/lib/cn";

/**
 * A checkbox.
 *
 * The primitive rather than `<input type="checkbox">` because the box is styled:
 * a native checkbox cannot carry the accent fill and stay consistent across
 * browsers, and hiding it behind a styled span is how you lose the label
 * association and the keyboard behaviour. Radix keeps both.
 *
 * Ported from the desktop client (commit 02749b3^) without its `motion`-drawn
 * tick — the animation is not worth a new dependency for one glyph.
 */
const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    className={cn(
      "peer size-4 shrink-0 rounded-sm border border-primary transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground",
      className,
    )}
    ref={ref}
    {...props}
  >
    <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current">
      <Check aria-hidden className="size-3.5" strokeWidth={3} />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = CheckboxPrimitive.Root.displayName;

export { Checkbox };
