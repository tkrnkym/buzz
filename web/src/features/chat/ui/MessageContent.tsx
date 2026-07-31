import { useCallback } from "react";
import { Link } from "@tanstack/react-router";

import {
  isMessageLink,
  resolveMessageLinkRenderTarget,
} from "@/features/chat/message-link";
import { Markdown, type LinkRenderer } from "@/shared/ui/markdown/Markdown";
import type { ImetaEntry } from "@/shared/ui/markdown/parse-imeta";

/**
 * Chat-side composition of the markdown primitive.
 *
 * This is where app knowledge lives: `buzz://message` links become in-app
 * navigation, and everything else falls through to the primitive's default
 * handling. The renderer itself stays feature-agnostic.
 */
export function MessageContent({
  content,
  imeta,
}: {
  content: string;
  imeta?: Map<string, ImetaEntry>;
}) {
  const renderLink = useCallback<LinkRenderer>(({ href, label, children }) => {
    const target = resolveMessageLinkRenderTarget({ href, label });
    if (target.kind === "none") {
      // Not a message link — let the primitive apply its own link safety rules.
      return null;
    }

    const to = "/c/$channelId";
    const params = { channelId: target.link.channelId };
    const search = { m: target.link.messageId };

    if (target.kind === "pill") {
      // An autolink has no author-written label, so show a compact affordance
      // rather than the raw URL.
      return (
        <Link
          to={to}
          params={params}
          search={search}
          className="inline-flex items-center rounded bg-secondary px-1.5 py-0.5 text-2xs font-medium text-secondary-foreground no-underline hover:bg-accent"
        >
          message
        </Link>
      );
    }

    return (
      <Link
        to={to}
        params={params}
        search={search}
        className="text-base text-primary underline underline-offset-2 hover:no-underline"
      >
        {children}
      </Link>
    );
  }, []);

  return (
    <Markdown
      content={content}
      // `nuxx:` is not a scheme react-markdown keeps, so allow it through before
      // the link renderer can act on it.
      preserveUrl={isMessageLink}
      renderLink={renderLink}
      imeta={imeta}
    />
  );
}
