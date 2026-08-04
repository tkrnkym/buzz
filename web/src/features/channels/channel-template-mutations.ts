import type { ChannelTemplate, Showcase } from "@/mock/showcase";

/**
 * Fixture edits for channel templates.
 *
 * The panel kept its own copy of the list in component state, so every template
 * created, renamed, duplicated or deleted was gone the moment the reader opened
 * another settings section. Every other mock-up surface writes to the shared
 * fixtures; this one looked identical and behaved differently, which is the worse
 * kind of inconsistency — nothing on screen says which one you are using.
 */

export function addChannelTemplate(
  current: Showcase,
  template: ChannelTemplate,
): Showcase {
  return {
    ...current,
    channelTemplates: [...current.channelTemplates, template],
  };
}

export function updateChannelTemplate(
  current: Showcase,
  template: ChannelTemplate,
): Showcase {
  return {
    ...current,
    channelTemplates: current.channelTemplates.map((row) =>
      row.id === template.id ? template : row,
    ),
  };
}

/**
 * Copy a template.
 *
 * The copy's `usedCount` starts at zero: the count is how often *this* template
 * has been used to make a channel, and inheriting the original's would credit the
 * copy with history it does not have. Inserted after the original rather than at
 * the end, so it appears where the reader was looking when they pressed copy.
 */
export function duplicateChannelTemplate(
  current: Showcase,
  id: string,
  newId: string,
): Showcase {
  const index = current.channelTemplates.findIndex((row) => row.id === id);
  const original = current.channelTemplates[index];
  if (!original) return current;
  const copy: ChannelTemplate = {
    ...original,
    id: newId,
    name: `${original.name} のコピー`,
    usedCount: 0,
  };
  const next = [...current.channelTemplates];
  next.splice(index + 1, 0, copy);
  return { ...current, channelTemplates: next };
}

export function removeChannelTemplate(current: Showcase, id: string): Showcase {
  return {
    ...current,
    channelTemplates: current.channelTemplates.filter((row) => row.id !== id),
  };
}
