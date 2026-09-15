/**
 * Image compression contract used before uploading a registration photo to
 * the `fotos` bucket (see AC29: stored file must be strictly smaller, in
 * bytes, than the original upload).
 *
 * STUB — interface shape only, zero real logic. Owned by the implementer
 * sub-task.
 */

export interface CompressImageOptions {
  /** Upper bound the implementation should aim to compress under, in bytes. */
  maxSizeBytes?: number;
}

export interface CompressImageResult {
  buffer: Buffer;
  contentType: string;
  sizeBytes: number;
}

export async function compressImage(
  _input: Buffer,
  _options?: CompressImageOptions,
): Promise<CompressImageResult> {
  throw new Error("compressImage is not implemented yet");
}
