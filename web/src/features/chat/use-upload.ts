/**
 * Attachment state for the composer.
 *
 * Uploading happens when the file is picked, not when the message is sent. A
 * send that had to upload first would sit there for the length of the transfer
 * with no way to cancel and no indication of progress — and if it failed, the
 * message would fail with it. Uploading up front makes the failure land on the
 * attachment, where it can be retried or dropped without losing the text.
 */

import { useCallback, useMemo, useState } from "react";

import { resolveSigner } from "@/shared/lib/signer";
import {
  type BlobDescriptor,
  UploadError,
  buildImetaTag,
  markdownForAttachment,
  uploadFile,
} from "@/features/chat/upload";

export interface Attachment {
  descriptor: BlobDescriptor;
  filename: string;
  /** The NIP-92 tag to publish alongside the message. */
  imeta: string[];
  /** The body text that makes it visible to the renderer. */
  markdown: string;
}

export interface UploadApi {
  attachments: Attachment[];
  isUploading: boolean;
  error: string | null;
  /** Upload a picked file; resolves with its body text, or null on failure. */
  attach: (file: File) => Promise<string | null>;
  remove: (sha256: string) => void;
  clear: () => void;
  dismissError: () => void;
}

export function useUpload(): UploadApi {
  // Resolved once per mount: `resolveSigner()` returns a fresh object each call,
  // and an unstable identity here would rebuild `attach` on every render.
  const signer = useMemo(() => resolveSigner(), []);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isUploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const attach = useCallback(
    async (file: File) => {
      setUploading(true);
      setError(null);
      try {
        const descriptor = await uploadFile(file, {
          signEvent: (template) => signer.sign(template),
        });
        const attachment: Attachment = {
          descriptor,
          filename: file.name,
          imeta: buildImetaTag(descriptor, file.name),
          markdown: markdownForAttachment(descriptor, file.name),
        };
        // The relay deduplicates by hash, so picking the same file twice yields
        // the same descriptor; keeping one entry stops the message carrying the
        // attachment twice.
        setAttachments((current) =>
          current.some((a) => a.descriptor.sha256 === descriptor.sha256)
            ? current
            : [...current, attachment],
        );
        return attachment.markdown;
      } catch (thrown) {
        setError(
          thrown instanceof UploadError
            ? thrown.message
            : thrown instanceof Error
              ? thrown.message
              : "Upload failed.",
        );
        return null;
      } finally {
        setUploading(false);
      }
    },
    [signer],
  );

  const remove = useCallback((sha256: string) => {
    setAttachments((current) =>
      current.filter((a) => a.descriptor.sha256 !== sha256),
    );
  }, []);

  const clear = useCallback(() => setAttachments([]), []);
  const dismissError = useCallback(() => setError(null), []);

  return {
    attachments,
    isUploading,
    error,
    attach,
    remove,
    clear,
    dismissError,
  };
}
