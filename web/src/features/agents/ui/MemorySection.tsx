import { Brain, TriangleAlert, Unlink } from "lucide-react";
import { useMemo } from "react";

import { formatRelativeTime } from "@/features/agents/agent-model";
import {
  buildMemoryGraph,
  type MemoryNode,
} from "@/features/agents/memory-model";
import { useShowcase } from "@/features/showcase/use-showcase";
import type { MemoryEntry } from "@/mock/showcase";

/** The slug's last segment, which is what distinguishes siblings. */
function shortSlug(slug: string): string {
  const parts = slug.split("/");
  return parts[parts.length - 1] ?? slug;
}

function MemoryTree({
  node,
  nowSeconds,
}: {
  node: MemoryNode<MemoryEntry>;
  nowSeconds: number;
}) {
  return (
    <li>
      <div className="flex flex-wrap items-baseline gap-2">
        <code className="text-2xs font-medium">
          {shortSlug(node.entry.slug)}
        </code>
        <span className="text-badge text-muted-foreground">
          {formatRelativeTime(node.entry.updatedAt, nowSeconds)}に更新
        </span>
      </div>
      <p className="mt-0.5 whitespace-pre-wrap text-badge text-muted-foreground">
        {node.entry.body}
      </p>
      {node.children.length > 0 && (
        // Indented with a rule rather than a bullet: the nesting *is* the
        // information here, and a rule survives three levels where bullets stop
        // being distinguishable.
        <ul className="mt-2 flex flex-col gap-2 border-l border-border pl-3">
          {node.children.map((child) => (
            <MemoryTree
              key={child.entry.slug}
              node={child}
              nowSeconds={nowSeconds}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * What an agent remembers.
 *
 * Rooted at `mem/core` and shown as a tree, because reachability is the useful
 * question: the agent consults what it can get to from core, so a memory sitting
 * outside that is not something it will use. Orphans and broken citations get
 * their own sections instead of being mixed in — both are almost always mistakes,
 * and burying them in an alphabetical list is how they stay unfixed.
 *
 * Read-only. Writing an engram means encrypting to the agent's key, and a viewer
 * that let someone edit a memory the agent could not then decrypt would be worse
 * than one that only reads.
 */
export function MemorySection({ agentPubkey }: { agentPubkey: string }) {
  const showcase = useShowcase();
  const nowSeconds = useMemo(() => Math.floor(Date.now() / 1000), []);
  const entries = showcase?.agentMemories[agentPubkey] ?? [];
  const graph = useMemo(() => buildMemoryGraph(entries), [entries]);

  if (!showcase) {
    return (
      <p className="text-badge text-muted-foreground">
        メモリはまだリレーから読めていません。
      </p>
    );
  }

  if (graph.count === 0) {
    return (
      <p
        className="text-badge text-muted-foreground"
        data-testid="memory-empty"
      >
        このエージェントはまだ何も覚えていません。
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3" data-testid="memory-section">
      <p className="flex items-center gap-1.5 text-badge text-muted-foreground">
        <Brain aria-hidden className="size-3" />
        {graph.count} 件。エージェントが実際に参照するのは、core
        からたどれるものだけです。
      </p>

      {graph.root ? (
        <ul className="flex flex-col gap-2" data-testid="memory-tree">
          <MemoryTree node={graph.root} nowSeconds={nowSeconds} />
        </ul>
      ) : (
        <p
          className="flex items-center gap-1.5 text-badge text-amber-600"
          data-testid="memory-no-core"
        >
          <TriangleAlert aria-hidden className="size-3" />
          mem/core がありません。この状態ではどのメモリも参照されません。
        </p>
      )}

      {graph.orphans.length > 0 && (
        <div className="flex flex-col gap-1.5 border-t border-border pt-3">
          <p
            className="flex items-center gap-1.5 text-badge font-medium text-muted-foreground"
            data-testid="memory-orphans"
          >
            <Unlink aria-hidden className="size-3" />
            どこからもたどれない（{graph.orphans.length} 件）
          </p>
          <ul className="flex flex-col gap-1.5">
            {graph.orphans.map((entry) => (
              <li key={entry.slug}>
                <code className="text-badge">{entry.slug}</code>
                <p className="text-badge text-muted-foreground">{entry.body}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {graph.dangling.length > 0 && (
        <div className="flex flex-col gap-1.5 border-t border-border pt-3">
          <p className="flex items-center gap-1.5 text-badge font-medium text-amber-600">
            <TriangleAlert aria-hidden className="size-3" />
            見つからない参照先（{graph.dangling.length} 件）
          </p>
          <ul className="flex flex-col gap-0.5" data-testid="memory-dangling">
            {graph.dangling.map((ref) => (
              <li className="text-badge text-muted-foreground" key={ref.slug}>
                <code>{ref.slug}</code> — {ref.referencedBy.join("、")} から参照
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
