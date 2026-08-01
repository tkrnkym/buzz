import { type ReactNode, useMemo } from "react";
import ReactMarkdown, {
  type Components,
  defaultUrlTransform,
} from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

import { cn } from "@/shared/lib/cn";
import { isClickableHref } from "@/shared/ui/markdown/link-safety";
import {
  EMOJI_ATTRIBUTE,
  rehypeEmoji,
} from "@/shared/ui/markdown/rehype-emoji";
import {
  MENTION_ATTRIBUTE,
  rehypeMentions,
} from "@/shared/ui/markdown/rehype-mentions";
import {
  type ImetaEntry,
  dimensionsFromDim,
} from "@/shared/ui/markdown/parse-imeta";

/**
 * Markdown renderer for user-authored content.
 *
 * A reusable primitive: it knows about CommonMark, GFM, chat line breaks, link
 * safety, and NIP-92 image sizing — and nothing about channels, messages,
 * profiles, or agents. Anything app-specific arrives through the injection
 * points below.
 *
 * That boundary is deliberate. The desktop renderer this replaces imports
 * `@/features/messages`, `@/features/profile`, and `@/features/agents` directly,
 * which makes it un-reusable (pulling in the whole agents feature to render a
 * paragraph) and creates an import cycle with the composer. Here the direction
 * only ever runs features → shared.
 *
 * Deliberately not implemented yet, and each is additive: syntax highlighting
 * (shiki), image lightbox, inline video, spoilers, custom emoji, and file cards.
 */

/** How a link should render. Return `null` to accept the default anchor. */
export type LinkRenderer = (link: {
  href: string;
  /** The anchor's text. Equal to `href` for a CommonMark autolink. */
  label: string;
  children: ReactNode;
}) => ReactNode | null;

export interface MarkdownProps {
  content: string;
  /**
   * Schemes react-markdown would otherwise strip that this caller handles.
   *
   * `defaultUrlTransform` blanks any unknown scheme *before* a link renderer can
   * see it, so an app-specific scheme (`nuxx://message?…`) has to be allowed
   * through here or copy → paste → click breaks end to end.
   */
  preserveUrl?: (url: string) => boolean;
  renderLink?: LinkRenderer;
  /** NIP-92 metadata for the event's attachments, keyed by URL. */
  imeta?: Map<string, ImetaEntry>;
  /**
   * Display names that render as a mention chip when written as `@Name`.
   *
   * Supplied by the caller rather than parsed, because only the app knows who
   * exists: an unknown `@handle` must stay plain text, since a chip asserts this
   * client resolved a person.
   */
  mentionLabels?: string[];
  /** Which of those names are the reader's, so their own mentions stand out. */
  isSelfMention?: (label: string) => boolean;
  /**
   * NIP-30 custom emoji defined by this event, keyed by bare shortcode.
   *
   * From the event's own `emoji` tags rather than the reader's palette: the
   * definition travels with the message, so an undefined `:shortcode:` stays
   * literal instead of picking up somebody else's picture.
   */
  emojiUrls?: Map<string, string>;
  className?: string;
}

/** Flatten a React subtree to its text, for autolink detection. */
function nodeText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(nodeText).join("");
  }
  if (
    node &&
    typeof node === "object" &&
    "props" in node &&
    node.props &&
    typeof node.props === "object" &&
    "children" in node.props
  ) {
    return nodeText((node.props as { children?: ReactNode }).children);
  }
  return "";
}

export function Markdown({
  content,
  preserveUrl,
  renderLink,
  imeta,
  mentionLabels,
  isSelfMention,
  emojiUrls,
  className,
}: MarkdownProps) {
  const components = useMemo<Components>(
    () => ({
      p: ({ children }) => <p className="text-base">{children}</p>,

      span: ({ node, children }) => {
        // `rehypeMentions` wrote this property, so it is read back by the exact
        // key it was written with rather than through a JSX prop name whose
        // casing depends on react-markdown's attribute mapping.
        const label = node?.properties?.[MENTION_ATTRIBUTE];
        if (typeof label !== "string") return <span>{children}</span>;
        return (
          <span
            className={cn(
              "rounded px-1 text-base font-medium",
              isSelfMention?.(label)
                ? "bg-primary text-primary-foreground"
                : "bg-primary/10 text-primary",
            )}
            data-mention={label}
          >
            {children}
          </span>
        );
      },

      a: ({ href, children }) => {
        const target = href ?? "";
        const label = nodeText(children);

        const custom = renderLink?.({ href: target, label, children });
        if (custom !== null && custom !== undefined) {
          return <>{custom}</>;
        }

        if (!isClickableHref(target)) {
          // Not a scheme we will activate — show the text, not a dead link.
          return <span className="text-base">{children}</span>;
        }

        return (
          <a
            href={target}
            target="_blank"
            // `noopener` denies the opened page access to `window.opener`;
            // `noreferrer` keeps the relay host out of its Referer.
            rel="noopener noreferrer"
            className="text-base text-primary underline underline-offset-2 hover:no-underline"
          >
            {children}
          </a>
        );
      },

      code: ({ className: codeClassName, children }) => {
        const isBlock = Boolean(codeClassName?.startsWith("language-"));
        if (isBlock) {
          // The `pre` override owns block layout; keep this to the text.
          return <code className="text-sm">{children}</code>;
        }
        return (
          <code className="rounded bg-muted px-1 py-0.5 text-sm">
            {children}
          </code>
        );
      },

      pre: ({ children }) => (
        <pre className="my-1 overflow-x-auto rounded-md bg-muted p-3 text-sm">
          {children}
        </pre>
      ),

      ul: ({ children }) => (
        <ul className="my-1 list-disc pl-5 text-base">{children}</ul>
      ),
      ol: ({ children }) => (
        <ol className="my-1 list-decimal pl-5 text-base">{children}</ol>
      ),
      li: ({ children }) => <li className="text-base">{children}</li>,

      blockquote: ({ children }) => (
        <blockquote className="my-1 border-l-2 border-border pl-3 text-base text-muted-foreground">
          {children}
        </blockquote>
      ),

      h1: ({ children }) => (
        <h1 className="mt-2 mb-1 text-lg font-semibold">{children}</h1>
      ),
      h2: ({ children }) => (
        <h2 className="mt-2 mb-1 text-base font-semibold">{children}</h2>
      ),
      h3: ({ children }) => (
        <h3 className="mt-2 mb-1 text-base font-semibold">{children}</h3>
      ),

      hr: () => <hr className="my-2 border-border" />,

      // Wide tables scroll inside their own box rather than widening the row.
      table: ({ children }) => (
        <div className="my-1 overflow-x-auto">
          <table className="w-full border-collapse text-sm">{children}</table>
        </div>
      ),
      th: ({ children }) => (
        <th className="border border-border px-2 py-1 text-left font-semibold">
          {children}
        </th>
      ),
      td: ({ children }) => (
        <td className="border border-border px-2 py-1">{children}</td>
      ),

      img: ({ node, src, alt }) => {
        const url = typeof src === "string" ? src : undefined;
        const shortcode = node?.properties?.[EMOJI_ATTRIBUTE];
        if (typeof shortcode === "string") {
          // Inline with the text it sits in, sized in em so it tracks the
          // surrounding type rather than a fixed pixel box.
          return (
            <img
              alt={alt ?? `:${shortcode}:`}
              className="inline-block h-[1.25em] w-auto align-text-bottom"
              data-emoji={shortcode}
              decoding="async"
              draggable={false}
              loading="lazy"
              src={url}
            />
          );
        }
        const entry = url ? imeta?.get(url) : undefined;
        const dimensions = dimensionsFromDim(entry?.dim);
        return (
          <img
            src={url}
            alt={alt ?? entry?.alt ?? ""}
            // Explicit intrinsic size reserves aspect-correct space before the
            // bytes arrive, so a tall image does not shove the timeline down
            // when it decodes.
            width={dimensions?.width}
            height={dimensions?.height}
            loading="lazy"
            decoding="async"
            className="my-1 max-h-64 max-w-full rounded-md object-contain"
          />
        );
      },
    }),
    [renderLink, imeta, isSelfMention],
  );

  // Joined so the plugin is rebuilt when the *names* change, not each time the
  // caller derives a fresh array from the profile cache. Newline is the
  // separator because a display name can contain a space but not a line break.
  const mentionKey = (mentionLabels ?? []).join("\n");
  // Same for the emoji definitions: keyed on the pairs, so a re-render with an
  // equal map does not rebuild the plugin.
  const emojiKey = emojiUrls
    ? [...emojiUrls].map(([code, url]) => `${code} ${url}`).join("\n")
    : "";
  const rehypePlugins = useMemo(
    () => [
      rehypeMentions(mentionKey ? mentionKey.split("\n") : []),
      rehypeEmoji(
        new Map(
          emojiKey
            ? emojiKey.split("\n").map((pair) => {
                const space = pair.indexOf(" ");
                return [pair.slice(0, space), pair.slice(space + 1)] as [
                  string,
                  string,
                ];
              })
            : [],
        ),
      ),
    ],
    [mentionKey, emojiKey],
  );

  const urlTransform = useMemo(
    () => (value: string, key: string) => {
      if (key === "href" && preserveUrl?.(value)) {
        return value;
      }
      return defaultUrlTransform(value);
    },
    [preserveUrl],
  );

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <ReactMarkdown
        // `remarkBreaks` maps a single newline to a line break: in chat a user
        // pressing Enter means a new line, not paragraph continuation.
        remarkPlugins={[remarkGfm, remarkBreaks]}
        rehypePlugins={rehypePlugins}
        urlTransform={urlTransform}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
