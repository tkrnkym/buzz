/**
 * An agent's memory graph.
 *
 * Memories are engrams (kind 30174), each addressed by a `mem/...` slug and each
 * free to cite others with `[[slug]]`. What the viewer needs is not the flat list
 * — it is which memories the agent can actually reach from `mem/core`, because
 * that is what it will consult, and anything unreachable is dead weight the owner
 * probably meant to link.
 *
 * So one pass produces three answers:
 *
 * - the tree rooted at `core`, which is what the agent uses;
 * - orphans, reachable from nothing, which is usually a mistake worth seeing;
 * - dangling refs, citations to a slug that is not there — a memory that was
 *   deleted, or a typo. Either way the agent will look for it and find nothing,
 *   so it is a defect and shown as one.
 *
 * Cycles are handled by visiting once: the first time a memory is reached it
 * becomes a node, later citations of it are dropped. The tree is therefore acyclic
 * by construction even when the graph is not.
 */

/** The slug every graph is rooted at. An agent with no core has no usable memory. */
export const CORE_SLUG = "mem/core";

export interface MemoryEntryLike {
  slug: string;
  body: string;
  updatedAt: number;
}

export interface MemoryNode<T extends MemoryEntryLike = MemoryEntryLike> {
  entry: T;
  children: MemoryNode<T>[];
}

export interface DanglingRef {
  slug: string;
  /** Which memories cited it, so the owner can find and fix the citation. */
  referencedBy: string[];
}

export interface MemoryGraph<T extends MemoryEntryLike = MemoryEntryLike> {
  /** Null when the agent has no `mem/core`. */
  root: MemoryNode<T> | null;
  orphans: T[];
  dangling: DanglingRef[];
  count: number;
}

const REF_PATTERN = /\[\[([^\]]+)\]\]/g;

/** Slugs a body cites, in order, deduplicated. */
export function memoryRefs(body: string): string[] {
  const refs: string[] = [];
  for (const match of body.matchAll(REF_PATTERN)) {
    const slug = match[1]?.trim();
    if (slug && !refs.includes(slug)) refs.push(slug);
  }
  return refs;
}

export function buildMemoryGraph<T extends MemoryEntryLike>(
  entries: T[],
): MemoryGraph<T> {
  const bySlug = new Map<string, T>();
  for (const entry of entries) bySlug.set(entry.slug, entry);

  const visited = new Set<string>();
  const danglingBy = new Map<string, string[]>();

  const build = (slug: string): MemoryNode<T> | null => {
    const entry = bySlug.get(slug);
    if (!entry || visited.has(slug)) return null;
    visited.add(slug);
    const children: MemoryNode<T>[] = [];
    for (const ref of memoryRefs(entry.body)) {
      if (!bySlug.has(ref)) {
        danglingBy.set(ref, [...(danglingBy.get(ref) ?? []), slug]);
        continue;
      }
      const child = build(ref);
      if (child) children.push(child);
    }
    return { entry, children };
  };

  const root = build(CORE_SLUG);

  // Orphans are what the walk never reached. Their own refs still count toward
  // dangling — a broken citation is broken whether or not the agent gets there.
  const orphans = entries
    .filter((entry) => !visited.has(entry.slug))
    .sort((left, right) => left.slug.localeCompare(right.slug));
  for (const orphan of orphans) {
    for (const ref of memoryRefs(orphan.body)) {
      if (bySlug.has(ref)) continue;
      danglingBy.set(ref, [...(danglingBy.get(ref) ?? []), orphan.slug]);
    }
  }

  const dangling = [...danglingBy]
    .map(([slug, referencedBy]) => ({ slug, referencedBy }))
    .sort((left, right) => left.slug.localeCompare(right.slug));

  return { root, orphans, dangling, count: entries.length };
}

/** Filter for one agent's engrams. */
export function buildMemoryFilter(
  agentPubkey: string,
  kind: number,
  limit = 200,
): { kinds: number[]; authors: string[]; limit: number } {
  return { kinds: [kind], authors: [agentPubkey.trim().toLowerCase()], limit };
}
