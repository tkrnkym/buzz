/**
 * Sidebar shell primitives, ported from the desktop client.
 *
 * Three behaviours are load-bearing and are why this is a primitive rather than
 * a few divs in the shell component:
 *
 * - **Resizable, persisted width.** The width is a CSS variable on the wrapper,
 *   so the gap element and the fixed panel stay in lockstep during a drag. It
 *   is stored in `localStorage`, and the default acts as a detent
 *   (`sidebar-width.ts`).
 * - **Collapse without reflowing the content.** The panel is absolutely
 *   positioned; a sibling spacer of the same width holds the layout open. On
 *   collapse the spacer shrinks and the panel slides out, so the main pane
 *   animates once instead of re-laying-out every frame.
 * - **Off-canvas below `md`.** The desktop client used a Radix sheet here; this
 *   is a plain overlay so the web bundle needs no dialog dependency.
 */

import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import * as React from "react";

import { useIsMobile } from "@/shared/hooks/use-media-breakpoint";
import { cn } from "@/shared/lib/cn";
import { hasPrimaryShortcutModifier } from "@/shared/lib/platform";
import { Skeleton } from "@/shared/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/shared/ui/tooltip";
import {
  SIDEBAR_WIDTH_DEFAULT,
  SIDEBAR_WIDTH_ICON,
  SIDEBAR_WIDTH_MOBILE,
  clampSidebarWidth,
  magnetizeSidebarWidth,
} from "@/shared/ui/sidebar-width";

const SIDEBAR_WIDTH_STORAGE_KEY = "nuxx-sidebar-width";
const SIDEBAR_KEYBOARD_SHORTCUT = "s";

type SidebarContextValue = {
  state: "expanded" | "collapsed";
  open: boolean;
  setOpen: (open: boolean) => void;
  openMobile: boolean;
  setOpenMobile: (open: boolean) => void;
  isMobile: boolean;
  isResizing: boolean;
  setIsResizing: (isResizing: boolean) => void;
  sidebarWidth: number;
  setSidebarWidth: (width: number | ((width: number) => number)) => void;
  toggleSidebar: () => void;
};

const SidebarContext = React.createContext<SidebarContextValue | null>(null);

export function useSidebar(): SidebarContextValue {
  const context = React.useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider.");
  }
  return context;
}

function readStoredSidebarWidth(): number {
  if (typeof window === "undefined") {
    return SIDEBAR_WIDTH_DEFAULT;
  }
  const stored = Number.parseInt(
    window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY) ?? "",
    10,
  );
  return Number.isFinite(stored)
    ? clampSidebarWidth(stored)
    : SIDEBAR_WIDTH_DEFAULT;
}

export function SidebarProvider({
  children,
  className,
  defaultOpen = true,
  style,
  ...props
}: React.ComponentProps<"div"> & { defaultOpen?: boolean }) {
  const isMobile = useIsMobile();
  const [open, setOpen] = React.useState(defaultOpen);
  const [openMobile, setOpenMobile] = React.useState(false);
  const [isResizing, setIsResizing] = React.useState(false);
  const [sidebarWidth, setSidebarWidthState] = React.useState(
    readStoredSidebarWidth,
  );

  const setSidebarWidth = React.useCallback(
    (value: number | ((width: number) => number)) => {
      setSidebarWidthState((current) => {
        const next = clampSidebarWidth(
          typeof value === "function" ? value(current) : value,
        );
        window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(next));
        return next;
      });
    },
    [],
  );

  const toggleSidebar = React.useCallback(() => {
    if (isMobile) {
      setOpenMobile((current) => !current);
    } else {
      setOpen((current) => !current);
    }
  }, [isMobile]);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === SIDEBAR_KEYBOARD_SHORTCUT &&
        hasPrimaryShortcutModifier(event)
      ) {
        event.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleSidebar]);

  const state = open ? "expanded" : "collapsed";

  const value = React.useMemo<SidebarContextValue>(
    () => ({
      state,
      open,
      setOpen,
      openMobile,
      setOpenMobile,
      isMobile,
      isResizing,
      setIsResizing,
      sidebarWidth,
      setSidebarWidth,
      toggleSidebar,
    }),
    [
      state,
      open,
      openMobile,
      isMobile,
      isResizing,
      sidebarWidth,
      setSidebarWidth,
      toggleSidebar,
    ],
  );

  return (
    <SidebarContext.Provider value={value}>
      <TooltipProvider delayDuration={0}>
        <div
          className={cn(
            "group/sidebar-wrapper flex h-full min-h-0 w-full",
            className,
          )}
          style={
            {
              "--sidebar-width": `${sidebarWidth}px`,
              "--sidebar-width-icon": SIDEBAR_WIDTH_ICON,
              ...style,
            } as React.CSSProperties
          }
          {...props}
        >
          {children}
        </div>
      </TooltipProvider>
    </SidebarContext.Provider>
  );
}

export function Sidebar({
  children,
  className,
  collapsible = "offcanvas",
  ...props
}: React.ComponentProps<"div"> & {
  collapsible?: "offcanvas" | "icon" | "none";
}) {
  const { isMobile, isResizing, state, openMobile, setOpenMobile } =
    useSidebar();

  if (isMobile) {
    // Off-canvas drawer. Rendered only while open so the closed state costs
    // nothing and cannot trap focus behind the page.
    if (!openMobile) return null;
    return (
      <div className="fixed inset-0 z-50 flex md:hidden">
        <button
          aria-label="Close sidebar"
          className="absolute inset-0 bg-black/50"
          onClick={() => setOpenMobile(false)}
          type="button"
        />
        <div
          className={cn(
            "relative flex h-full w-(--sidebar-width) flex-col bg-sidebar text-sidebar-foreground shadow-xl",
            className,
          )}
          data-mobile="true"
          data-sidebar="sidebar"
          style={
            { "--sidebar-width": SIDEBAR_WIDTH_MOBILE } as React.CSSProperties
          }
          {...props}
        >
          {children}
        </div>
      </div>
    );
  }

  return (
    <div
      className="group peer relative hidden text-sidebar-foreground md:block"
      data-collapsible={state === "collapsed" ? collapsible : ""}
      data-resizing={isResizing}
      data-side="left"
      data-state={state}
    >
      {/* Holds the layout open. The panel below is absolute, so this is what
          the main pane is actually pushed by. */}
      <div
        className={cn(
          "relative w-(--sidebar-width) bg-transparent transition-[width] duration-200 ease-linear",
          "group-data-[resizing=true]:transition-none",
          "group-data-[collapsible=offcanvas]:w-0",
          "group-data-[collapsible=icon]:w-(--sidebar-width-icon)",
        )}
      />
      <div
        className={cn(
          "absolute inset-y-0 left-0 z-10 flex h-full w-(--sidebar-width) transition-[left,width] duration-200 ease-linear",
          "group-data-[resizing=true]:transition-none",
          "group-data-[collapsible=offcanvas]:left-[calc(var(--sidebar-width)*-1)]",
          "group-data-[collapsible=icon]:w-(--sidebar-width-icon)",
          className,
        )}
        {...props}
      >
        <div
          className="flex h-full w-full flex-col bg-sidebar"
          data-sidebar="sidebar"
        >
          {children}
        </div>
      </div>
    </div>
  );
}

export function SidebarTrigger({
  className,
  onClick,
  ...props
}: React.ComponentProps<"button">) {
  const { toggleSidebar, open, isMobile, openMobile } = useSidebar();
  const isOpen = isMobile ? openMobile : open;

  return (
    <button
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&>svg]:size-4",
        className,
      )}
      data-sidebar="trigger"
      onClick={(event) => {
        onClick?.(event);
        toggleSidebar();
      }}
      type="button"
      {...props}
    >
      {isOpen ? <PanelLeftClose /> : <PanelLeftOpen />}
      <span className="sr-only">Toggle sidebar</span>
    </button>
  );
}

/**
 * The drag handle on the sidebar's trailing edge.
 *
 * Pointer capture rather than window listeners: the pointer routinely leaves
 * the 1rem-wide handle mid-drag, and without capture the resize would stop the
 * moment it did.
 */
export function SidebarRail({
  className,
  ...props
}: React.ComponentProps<"button">) {
  const { setIsResizing, setSidebarWidth, sidebarWidth, state } = useSidebar();
  const dragRef = React.useRef<{
    hasDragged: boolean;
    pointerId: number;
    previousCursor: string;
    previousUserSelect: string;
    startWidth: number;
    startX: number;
  } | null>(null);

  const finishResize = React.useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      document.documentElement.style.cursor = drag.previousCursor;
      document.body.style.userSelect = drag.previousUserSelect;
      setIsResizing(false);
      dragRef.current = null;
    },
    [setIsResizing],
  );

  return (
    <button
      aria-label="Resize sidebar"
      className={cn(
        "absolute inset-y-0 -right-2 z-20 hidden w-4 cursor-col-resize sm:flex",
        "disabled:pointer-events-none disabled:hidden",
        className,
      )}
      data-sidebar="rail"
      disabled={state !== "expanded"}
      // Standard affordance for a resizable panel, and the only way back to the
      // default once a drag has moved past the detent's reach.
      onDoubleClick={() => setSidebarWidth(SIDEBAR_WIDTH_DEFAULT)}
      onPointerCancel={finishResize}
      onPointerDown={(event) => {
        if (event.defaultPrevented || event.button !== 0) return;
        dragRef.current = {
          hasDragged: false,
          pointerId: event.pointerId,
          previousCursor: document.documentElement.style.cursor,
          previousUserSelect: document.body.style.userSelect,
          startWidth: sidebarWidth,
          startX: event.clientX,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
        document.documentElement.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
        setIsResizing(true);
      }}
      onPointerMove={(event) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;

        const delta = event.clientX - drag.startX;
        // A few pixels of slack so a click on the handle is not a 1px resize.
        if (!drag.hasDragged && Math.abs(delta) < 3) return;

        drag.hasDragged = true;
        event.preventDefault();
        setSidebarWidth(magnetizeSidebarWidth(drag.startWidth + delta));
      }}
      onPointerUp={finishResize}
      tabIndex={-1}
      title="Drag to resize sidebar"
      type="button"
      {...props}
    />
  );
}

export function SidebarInset({
  className,
  ...props
}: React.ComponentProps<"main">) {
  return (
    <main
      className={cn(
        "relative flex min-w-0 flex-1 flex-col bg-background",
        className,
      )}
      {...props}
    />
  );
}

export function SidebarHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex flex-col gap-2 p-2", className)}
      data-sidebar="header"
      {...props}
    />
  );
}

export function SidebarFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex flex-col gap-2 p-2", className)}
      data-sidebar="footer"
      {...props}
    />
  );
}

export function SidebarContent({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-2 overflow-auto [scrollbar-gutter:stable] group-data-[collapsible=icon]:overflow-hidden",
        className,
      )}
      data-sidebar="content"
      {...props}
    />
  );
}

export function SidebarGroup({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("relative flex w-full min-w-0 flex-col p-2", className)}
      data-sidebar="group"
      {...props}
    />
  );
}

export function SidebarGroupLabel({
  asChild = false,
  className,
  ...props
}: React.ComponentProps<"div"> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "div";
  return (
    <Comp
      className={cn(
        "flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-medium text-sidebar-foreground/70 ring-sidebar-ring transition-[margin,opacity] duration-200 ease-linear focus-visible:outline-none focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0",
        "group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0",
        className,
      )}
      data-sidebar="group-label"
      {...props}
    />
  );
}

export function SidebarGroupAction({
  asChild = false,
  className,
  ...props
}: React.ComponentProps<"button"> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      className={cn(
        "absolute right-3 top-3.5 z-10 flex size-6 items-center justify-center rounded-[4px] p-1 text-sidebar-foreground ring-sidebar-ring transition-colors hover:bg-sidebar-border/35 focus-visible:outline-none focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0",
        // Widen the hit area on touch, where a 24px target is too small.
        "after:absolute after:-inset-2 after:md:hidden",
        "group-data-[collapsible=icon]:hidden",
        className,
      )}
      data-sidebar="group-action"
      {...props}
    />
  );
}

export function SidebarGroupContent({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("w-full text-sm", className)}
      data-sidebar="group-content"
      {...props}
    />
  );
}

export function SidebarMenu({
  className,
  ...props
}: React.ComponentProps<"ul">) {
  return (
    <ul
      className={cn("flex w-full min-w-0 flex-col gap-0.5", className)}
      data-sidebar="menu"
      {...props}
    />
  );
}

export function SidebarMenuItem({
  className,
  ...props
}: React.ComponentProps<"li">) {
  return (
    <li
      className={cn("group/menu-item relative", className)}
      data-sidebar="menu-item"
      {...props}
    />
  );
}

const sidebarMenuButtonVariants = cva(
  "peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm ring-sidebar-ring transition-[width,height,padding] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 group-has-[[data-sidebar=menu-action]]/menu-item:pr-8 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:bg-sidebar-active data-[active=true]:font-semibold data-[active=true]:text-sidebar-active-foreground data-[active=true]:shadow-xs data-[active=true]:hover:bg-sidebar-active data-[active=true]:hover:text-sidebar-active-foreground group-data-[collapsible=icon]:!size-8 group-data-[collapsible=icon]:!p-2 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0",
  {
    variants: {
      size: {
        default: "h-8 text-sm",
        sm: "h-7 text-xs",
        lg: "h-12 text-sm group-data-[collapsible=icon]:!p-0",
      },
    },
    defaultVariants: { size: "default" },
  },
);

export function SidebarMenuButton({
  asChild = false,
  className,
  isActive = false,
  size = "default",
  tooltip,
  ...props
}: React.ComponentProps<"button"> & {
  asChild?: boolean;
  isActive?: boolean;
  tooltip?: string;
} & VariantProps<typeof sidebarMenuButtonVariants>) {
  const Comp = asChild ? Slot : "button";
  const { isMobile, state } = useSidebar();

  const button = (
    <Comp
      className={cn(sidebarMenuButtonVariants({ size }), className)}
      data-active={isActive}
      data-sidebar="menu-button"
      data-size={size}
      {...props}
    />
  );

  if (!tooltip) return button;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      {/* Only useful once the label is gone: while the sidebar is expanded the
          tooltip would just repeat the text next to the cursor. */}
      <TooltipContent
        align="center"
        hidden={state !== "collapsed" || isMobile}
        side="right"
      >
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}

export function SidebarMenuAction({
  asChild = false,
  className,
  showOnHover = false,
  ...props
}: React.ComponentProps<"button"> & {
  asChild?: boolean;
  showOnHover?: boolean;
}) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      className={cn(
        "absolute right-1 top-1.5 flex aspect-square w-5 items-center justify-center rounded-md p-0 text-sidebar-foreground ring-sidebar-ring transition-transform hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 peer-hover/menu-button:text-sidebar-accent-foreground [&>svg]:size-4 [&>svg]:shrink-0",
        "after:absolute after:-inset-2 after:md:hidden",
        "group-data-[collapsible=icon]:hidden",
        showOnHover &&
          "group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100 data-[state=open]:opacity-100 peer-data-[active=true]/menu-button:text-sidebar-active-foreground md:opacity-0",
        className,
      )}
      data-sidebar="menu-action"
      {...props}
    />
  );
}

export function SidebarMenuBadge({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute right-1 top-1.5 flex h-5 min-w-5 select-none items-center justify-center rounded-md px-1 text-xs font-medium tabular-nums text-sidebar-foreground",
        "peer-hover/menu-button:text-sidebar-accent-foreground peer-data-[active=true]/menu-button:text-sidebar-active-foreground",
        "group-data-[collapsible=icon]:hidden",
        className,
      )}
      data-sidebar="menu-badge"
      {...props}
    />
  );
}

export function SidebarMenuSkeleton({
  className,
  showIcon = false,
  widthPercent = 70,
  ...props
}: React.ComponentProps<"div"> & {
  showIcon?: boolean;
  /**
   * Bar width as a percentage. Ragged widths read as a list of names rather
   * than a table; the caller passes them so the shape is stable across renders
   * (a random width per render would twitch).
   */
  widthPercent?: number;
}) {
  return (
    <div
      className={cn("flex h-8 items-center gap-2 rounded-md px-2", className)}
      data-sidebar="menu-skeleton"
      {...props}
    >
      {showIcon && <Skeleton className="size-4 rounded-md" />}
      <Skeleton className="h-4" style={{ width: `${widthPercent}%` }} />
    </div>
  );
}
