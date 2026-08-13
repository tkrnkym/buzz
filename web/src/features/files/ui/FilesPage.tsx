import { ExternalLink, FileText, Hash, Lock } from "lucide-react";
import { useMemo } from "react";

import {
  formatFileSize,
  KIND_LABELS,
  LOCKED_FILE_MESSAGE,
  ORIGIN_LABELS,
  originOfTruth,
  viewFiles,
} from "@/features/files/files-model";
import { formatRelativeTime } from "@/features/agents/agent-model";
import { resolveUserLabel } from "@/features/profile/profile-model";
import { useProfiles } from "@/features/profile/profile-store";
import { NotWiredUp, ShowcasePage } from "@/features/showcase/ui/ShowcasePage";
import { useShowcase } from "@/features/showcase/use-showcase";
import type { ShowcaseFile } from "@/mock/showcase";

/**
 * Files, as a resource of their own.
 *
 * Not owned by a channel or a project — associated with them. That is the
 * spec's shape and it is the one that survives contact with reality: the same
 * design document gets linked from three channels, and a model where the first
 * one owns it makes the other two references second-class.
 *
 * A row says where the authoritative copy lives, because that is the difference
 * that bites. A linked file's source can revoke access tomorrow and the row
 * will go locked; an imported one cannot, because Nuxx holds the bytes.
 */
export function FilesPage() {
  const showcase = useShowcase();
  const files = showcase?.files ?? [];
  const views = useMemo(() => viewFiles(files), [files]);

  // Only readable files contribute an author to resolve. Asking the profile
  // store about a locked file's author would be a lookup the reader is not
  // entitled to make.
  const authors = useMemo(
    () =>
      views.flatMap((view) => (view.locked ? [] : [view.file.authorPubkey])),
    [views],
  );
  const profiles = useProfiles(authors);

  if (!showcase) {
    return (
      <ShowcasePage
        subtitle="チャンネルやプロジェクトから参照される実体"
        title="Files"
      >
        <NotWiredUp what="ファイル" />
      </ShowcasePage>
    );
  }

  const lockedCount = views.filter((view) => view.locked).length;

  return (
    <ShowcasePage
      subtitle={
        lockedCount > 0
          ? `${views.length} 件（うち ${lockedCount} 件は権限がありません）`
          : `${views.length} 件`
      }
      title="Files"
    >
      <ul className="flex flex-col gap-2" data-testid="file-list">
        {views.length === 0 && (
          <li className="text-2xs text-muted-foreground">
            ファイルはまだありません。
          </li>
        )}
        {views.map((view) =>
          view.locked ? (
            // Everything this row is allowed to say. No name, no origin, no
            // size, no author, no thumbnail — see `files-model.ts`.
            <li
              className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2.5 text-2xs text-muted-foreground"
              data-testid={`file-locked-${view.id}`}
              key={view.id}
            >
              <Lock aria-hidden className="size-3.5 shrink-0" />
              {LOCKED_FILE_MESSAGE}
            </li>
          ) : (
            <FileRow
              authorLabel={resolveUserLabel({
                pubkey: view.file.authorPubkey,
                profiles,
                preferResolvedSelfLabel: true,
              })}
              file={view.file}
              key={view.file.id}
            />
          ),
        )}
      </ul>
    </ShowcasePage>
  );
}

function FileRow({
  authorLabel,
  file,
}: {
  authorLabel: string;
  file: ShowcaseFile;
}) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const external = originOfTruth(file) === "external";

  return (
    <li
      className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-3 py-2.5"
      data-testid={`file-${file.id}`}
    >
      <span className="shrink-0 text-muted-foreground">
        {external ? (
          <ExternalLink aria-hidden className="size-3.5" />
        ) : (
          <FileText aria-hidden className="size-3.5" />
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{file.name}</span>
        <span className="flex flex-wrap items-center gap-x-2 text-badge text-muted-foreground">
          {/* Where the authoritative copy lives, stated rather than implied by
              an icon: it is what decides whether this row can go locked. */}
          <span>
            {ORIGIN_LABELS[file.origin]} · {KIND_LABELS[file.kind]}
          </span>
          <span>v{file.version}</span>
          <span>{formatFileSize(file.sizeBytes)}</span>
          <span>{authorLabel}</span>
          <span>{formatRelativeTime(file.updatedAt, nowSeconds)}</span>
        </span>
      </span>

      {file.channel && (
        <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-secondary px-1.5 py-0.5 text-badge text-secondary-foreground">
          <Hash aria-hidden className="size-2.5" />
          {file.channel}
        </span>
      )}
    </li>
  );
}
