import { useCallback, useMemo, useState } from "react";

import { UploadError, uploadFile } from "@/features/chat/upload";
import { resolveSigner } from "@/shared/lib/signer";

/**
 * Largest avatar accepted, before it reaches the relay.
 *
 * Well under the general upload ceiling: an avatar renders at 40px and a
 * multi-megabyte one costs every reader in the community the download on every
 * timeline it appears in. Rejecting here says so, rather than accepting it and
 * quietly making everyone else slower.
 */
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

/** What the relay's media store accepts for a picture. */
const IMAGE_TYPES = /^image\/(png|jpeg|gif|webp|avif)$/;

/**
 * Upload a picture and get back its URL, for the profile's `picture` field.
 *
 * Blossom, the same path attachments take — an avatar is a blob like any other,
 * and giving it a second upload route would mean two sets of auth, limits and
 * failure modes to keep in step. The URL is returned rather than published:
 * kind:0 is one event carrying every field, so the caller saves it with the rest
 * of the form instead of this publishing a half-finished profile.
 */
export function useAvatarUpload(): {
  isUploading: boolean;
  error: string | null;
  upload: (file: File) => Promise<string | null>;
  dismissError: () => void;
} {
  // Resolved once per mount: `resolveSigner()` returns a fresh object each call,
  // and an unstable identity here would rebuild `upload` on every render.
  const signer = useMemo(() => resolveSigner(), []);
  const [isUploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(
    async (file: File) => {
      if (!IMAGE_TYPES.test(file.type)) {
        setError("That is not an image the relay will store.");
        return null;
      }
      if (file.size > MAX_AVATAR_BYTES) {
        setError("Pictures are limited to 2 MB. Try a smaller one.");
        return null;
      }

      setUploading(true);
      setError(null);
      try {
        const descriptor = await uploadFile(file, {
          signEvent: (template) => signer.sign(template),
        });
        return descriptor.url;
      } catch (thrown) {
        setError(
          thrown instanceof UploadError || thrown instanceof Error
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

  return {
    isUploading,
    error,
    upload,
    dismissError: useCallback(() => setError(null), []),
  };
}
