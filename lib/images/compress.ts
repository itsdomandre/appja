/**
 * Image compression used before uploading a registration photo to the
 * `fotos` bucket (see AC29: stored file must be strictly smaller, in bytes,
 * than the original upload).
 */
import sharp from "sharp";

export interface CompressImageOptions {
  /** Upper bound the implementation should aim to compress under, in bytes. */
  maxSizeBytes?: number;
}

export interface CompressImageResult {
  buffer: Buffer;
  contentType: string;
  sizeBytes: number;
}

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 80;

export async function compressImage(
  input: Buffer,
  _options?: CompressImageOptions,
): Promise<CompressImageResult> {
  const buffer = await sharp(input)
    .rotate()
    .resize({
      width: MAX_DIMENSION,
      height: MAX_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();

  return {
    buffer,
    contentType: "image/jpeg",
    sizeBytes: buffer.length,
  };
}
