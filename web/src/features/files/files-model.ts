import type { ShowcaseFile } from "@/mock/showcase";

/**
 * What a reader is allowed to learn about a file.
 *
 * The rule that shapes this module: a file the reader cannot open shows the
 * lock message and *nothing else*. Not its name, not where it came from, not a
 * thumbnail, not its size, not who added it. That is a stronger rule than it
 * first looks — "決算_最終版_役員会.xlsx" in a greyed-out row tells you most of
 * what the file was for, and a size plus an author tells you the rest.
 *
 * So a locked file is not "a file with a flag on it" here. It is modelled as a
 * separate shape that structurally has no fields to leak, which is what stops a
 * later component from reaching for `file.name` on a row it should not have.
 */

export type FileView =
  | { locked: true; id: string }
  | { locked: false; file: ShowcaseFile };

/** The one sentence a locked row is allowed to say. */
export const LOCKED_FILE_MESSAGE = "🔒 このFileを表示する権限がありません";

/**
 * One file, as much of it as this reader may see.
 *
 * The id survives, because the row needs a React key and a locked row is still
 * a row. It is a random identifier and carries nothing about the content — the
 * fixtures use opaque ids for exactly this reason.
 */
export function viewFile(file: ShowcaseFile): FileView {
  if (file.access === "denied") return { locked: true, id: file.id };
  return { locked: false, file };
}

/**
 * The list, with locked entries left in place.
 *
 * Left in rather than filtered out: the reader is better off knowing that
 * something is there and closed to them than being shown a list that silently
 * omits it. Hiding it entirely also makes "why does this channel say 12 files
 * and show 9" a question nobody can answer.
 */
export function viewFiles(files: ShowcaseFile[]): FileView[] {
  return files.map(viewFile);
}

/**
 * The files a search, a summary, or an agent may see.
 *
 * Locked files are removed outright here — not redacted, removed. Search and
 * summarisation are exactly the paths by which a name or a snippet escapes a
 * permission check, so they never receive the object at all.
 */
export function searchableFiles(files: ShowcaseFile[]): ShowcaseFile[] {
  return files.filter((file) => file.access === "granted");
}

/**
 * Where the authoritative copy lives.
 *
 * A linked file is a pointer: the source system decides who may read it and can
 * revoke that at any time. An imported file was copied into Nuxx at a moment in
 * time and is Nuxx's to serve. Conflating them is how a "file" survives in
 * search after the drive it came from took it away.
 */
export function originOfTruth(file: ShowcaseFile): "nuxx" | "external" {
  return file.kind === "import" ? "nuxx" : "external";
}

export const KIND_LABELS: Record<ShowcaseFile["kind"], string> = {
  link: "リンク",
  import: "取り込み",
};

export const ORIGIN_LABELS: Record<ShowcaseFile["origin"], string> = {
  nuxx: "Nuxx",
  "google-drive": "Google Drive",
  sharepoint: "SharePoint",
  github: "GitHub",
};

/**
 * The visibility a newly linked external file starts at.
 *
 * Public by default, because a file linked into a channel is normally something
 * the team already shares. But only when the source has actually confirmed that
 * every workspace member can read it — an unconfirmed link starts private,
 * since defaulting the other way publishes the *existence and name* of a
 * document to people the source system would not have shown it to.
 */
export function defaultLinkVisibility(
  allMembersConfirmedReadable: boolean,
): "public" | "private" {
  return allMembersConfirmedReadable ? "public" : "private";
}

/** `2.4 MB`, or `—` where the size is not known. */
export function formatFileSize(bytes: number | null): string {
  if (bytes === null || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}
