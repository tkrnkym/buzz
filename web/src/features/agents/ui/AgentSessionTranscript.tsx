import {
  AlertTriangle,
  ChevronRight,
  FilePenLine,
  FileText,
  ListChecks,
  Lightbulb,
  MessageSquare,
  Radio,
  ShieldCheck,
  Terminal,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";

import {
  diffLineParts,
  diffStat,
  groupSessionEvents,
  readsLabel,
  RENDER_CLASS_LABELS,
  startsExpanded,
  TONE_CLASS,
  type SessionGroup,
} from "@/features/agents/agent-session-model";
import type {
  AgentSessionEvent,
  SessionDetail,
  SessionRenderClass,
} from "@/mock/showcase";
import { cn } from "@/shared/lib/cn";

const CLASS_ICON: Record<SessionRenderClass, LucideIcon> = {
  message: MessageSquare,
  shell: Terminal,
  "file-edit": FilePenLine,
  "file-read": FileText,
  "relay-op": Radio,
  thought: Lightbulb,
  plan: ListChecks,
  permission: ShieldCheck,
  error: AlertTriangle,
};

/** A shell command and its output. */
function ShellBody({
  command,
  exitCode,
  output,
}: {
  command: string;
  exitCode: number;
  output: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <code className="block overflow-x-auto whitespace-pre rounded-md bg-muted px-2 py-1.5 font-mono text-2xs">
        <span className="select-none text-muted-foreground">$ </span>
        {command}
      </code>
      {output && (
        <pre className="overflow-x-auto rounded-md bg-muted/60 px-2 py-1.5 font-mono text-2xs text-muted-foreground">
          {output}
        </pre>
      )}
      {/* Only a non-zero code is worth a line: "exit 0" on every command is
          noise, and its absence is what makes a failure stand out. */}
      {exitCode !== 0 && (
        <p className="text-badge text-destructive">exit {exitCode}</p>
      )}
    </div>
  );
}

/**
 * An edit, as the lines that changed.
 *
 * Hand-rolled rather than pulling in a diff library: the mock has unified-diff
 * text and needs to colour three kinds of line, and a dependency that parses
 * hunks, matches them across revisions and renders side-by-side is a lot of
 * machinery to display six lines.
 */
function DiffBody({ lines, path }: { lines: string[]; path: string }) {
  const { added, removed } = diffStat(lines);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <code className="font-mono text-2xs text-muted-foreground">{path}</code>
        <span className="text-badge text-status-added">+{added}</span>
        <span className="text-badge text-status-deleted">−{removed}</span>
      </div>
      <div className="overflow-x-auto rounded-md border border-border">
        {lines.map((line, index) => {
          const { sign, text } = diffLineParts(line);
          return (
            <div
              className={cn(
                "whitespace-pre px-2 py-0.5 font-mono text-2xs",
                sign === "add" && "bg-status-added/10 text-foreground",
                sign === "remove" &&
                  "bg-status-deleted/10 text-muted-foreground",
                sign === "context" && "text-muted-foreground",
              )}
              // The line's own text is not unique in a diff — two identical
              // context lines are normal — so the index is the honest key here.
              key={`${index}-${line}`}
            >
              <span className="select-none text-muted-foreground">
                {sign === "add" ? "+" : sign === "remove" ? "−" : " "}
              </span>
              {text}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TodoBody({ items }: { items: { text: string; done: boolean }[] }) {
  return (
    <ul className="flex flex-col gap-1">
      {items.map((item) => (
        <li
          className={cn(
            "flex items-center gap-1.5 text-2xs",
            item.done && "text-muted-foreground line-through",
          )}
          key={item.text}
        >
          <ListChecks
            aria-hidden
            className={cn("size-3 shrink-0", !item.done && "text-primary")}
          />
          {item.text}
        </li>
      ))}
    </ul>
  );
}

function DetailBody({ detail }: { detail: SessionDetail }) {
  if (detail.kind === "shell") {
    return (
      <ShellBody
        command={detail.command}
        exitCode={detail.exitCode}
        output={detail.output}
      />
    );
  }
  if (detail.kind === "diff") {
    return <DiffBody lines={detail.lines} path={detail.path} />;
  }
  return <TodoBody items={detail.items} />;
}

/** One thing the agent did. */
function EventRow({ event }: { event: AgentSessionEvent }) {
  const [open, setOpen] = useState(() => startsExpanded(event));
  const Icon = CLASS_ICON[event.renderClass];
  const hasBody = Boolean(event.detail);

  const header = (
    <>
      <Icon
        aria-hidden
        className={cn("mt-0.5 size-3.5 shrink-0", TONE_CLASS[event.tone])}
      />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-2xs font-medium">{event.label}</span>
          <span className="text-badge text-muted-foreground">
            {RENDER_CLASS_LABELS[event.renderClass]}
          </span>
          {event.status === "running" && (
            <span className="text-badge text-primary">実行中</span>
          )}
          {event.status === "failed" && (
            <span className="text-badge text-destructive">失敗</span>
          )}
        </span>
        {event.preview && (
          <span className="mt-0.5 block text-badge text-muted-foreground">
            {event.preview}
          </span>
        )}
      </span>
    </>
  );

  return (
    <li
      className="border-b border-border/60 last:border-b-0"
      data-testid={`session-event-${event.seq}`}
    >
      {hasBody ? (
        <>
          <button
            aria-expanded={open}
            className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-accent/40"
            data-testid={`session-toggle-${event.seq}`}
            onClick={() => setOpen((current) => !current)}
            type="button"
          >
            <ChevronRight
              aria-hidden
              className={cn(
                "mt-0.5 size-3 shrink-0 text-muted-foreground transition-transform",
                open && "rotate-90",
              )}
            />
            {header}
          </button>
          {open && event.detail && (
            <div
              className="px-3 pb-2.5 pl-8"
              data-testid={`session-detail-${event.seq}`}
            >
              <DetailBody detail={event.detail} />
            </div>
          )}
        </>
      ) : (
        // No body, no disclosure: a chevron that expands nothing is worse than
        // the row being visibly flat.
        <div className="flex items-start gap-2 px-3 py-2 pl-8">{header}</div>
      )}
    </li>
  );
}

/** A run of consecutive reads, behind one row. */
function ReadsRow({ events }: { events: AgentSessionEvent[] }) {
  const [open, setOpen] = useState(false);

  if (events.length === 1) {
    const [only] = events;
    return only ? <EventRow event={only} /> : null;
  }

  return (
    <li className="border-b border-border/60 last:border-b-0">
      <button
        aria-expanded={open}
        className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-accent/40"
        data-testid={`session-reads-${events[0]?.seq}`}
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <ChevronRight
          aria-hidden
          className={cn(
            "mt-0.5 size-3 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-90",
          )}
        />
        <FileText
          aria-hidden
          className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
        />
        <span className="min-w-0 flex-1 text-2xs font-medium">
          {readsLabel(events)}
        </span>
      </button>
      {open && (
        <ul className="pl-6">
          {events.map((event) => (
            <EventRow event={event} key={event.seq} />
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * What an agent has been doing.
 *
 * The surface the desktop client had and this one did not: an agent's own
 * account of its run — the commands it ran, the files it changed, the plan it is
 * working through. Without it the Agents screen can say an agent is working but
 * never what it is doing, which is the state operators complained about most.
 *
 * Rows are collapsed by default and open on demand; which ones open themselves is
 * decided in `agent-session-model.ts`, along with which reads fold together.
 */
export function AgentSessionTranscript({
  events,
}: {
  events: AgentSessionEvent[];
}) {
  if (events.length === 0) {
    return (
      <p className="text-2xs text-muted-foreground" data-testid="session-empty">
        まだ何もしていません。
      </p>
    );
  }

  return (
    <ul
      className="overflow-hidden rounded-lg border border-border"
      data-testid="agent-session-transcript"
    >
      {groupSessionEvents(events).map((group: SessionGroup) =>
        group.kind === "reads" ? (
          <ReadsRow
            events={group.events}
            key={`reads-${group.events[0]?.seq}`}
          />
        ) : (
          <EventRow event={group.event} key={group.event.seq} />
        ),
      )}
    </ul>
  );
}
