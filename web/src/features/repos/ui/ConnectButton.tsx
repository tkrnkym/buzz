import { Link } from "@tanstack/react-router";
import { MessageSquare } from "lucide-react";

import { Button } from "@/shared/ui/button";

/**
 * Entry point from the repo browser into chat.
 *
 * This used to fire a `nuxx://connect` deep link that opened the desktop app;
 * with that client removed the link had no handler anywhere, so the button was
 * a dead end for every visitor. Chat lives in this same web client now, so the
 * button is an in-app navigation.
 */
export function ConnectButton({ className }: { className?: string }) {
  return (
    <Button
      asChild
      className={`bg-black text-white hover:bg-black/90 focus-visible:ring-black dark:bg-white dark:text-black dark:hover:bg-white/90 dark:focus-visible:ring-white ${className ?? ""}`}
    >
      <Link to="/c">
        <MessageSquare className="h-4 w-4" />
        Open chat
      </Link>
    </Button>
  );
}
