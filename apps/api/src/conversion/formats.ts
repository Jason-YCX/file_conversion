export const SOURCE_FORMATS = [
  "自动识别",
  "JPG",
  "PNG",
  "WebP",
  "AVIF",
  "HEIC",
  "SVG",
  "GIF",
  "TIFF",
] as const;

export const TARGET_FORMATS = ["WebP", "JPG", "PNG", "AVIF", "GIF", "TIFF"] as const;
export const COMPRESSIBLE_FORMATS = ["JPG", "PNG", "WebP", "AVIF", "GIF", "TIFF"] as const;
export const ORIGINAL_TARGET_FORMAT = "original" as const;
export const JOB_OPERATIONS = ["convert", "compress"] as const;
export const COMPRESSION_PRESETS = [
  "high_quality",
  "balanced",
  "small_file",
  "custom",
] as const;

export type SourceFormat = (typeof SOURCE_FORMATS)[number];
export type TargetFormat = (typeof TARGET_FORMATS)[number];
export type CompressibleFormat = (typeof COMPRESSIBLE_FORMATS)[number];
export type RequestedTargetFormat = TargetFormat | typeof ORIGINAL_TARGET_FORMAT;
export type JobOperation = (typeof JOB_OPERATIONS)[number];
export type CompressionPreset = (typeof COMPRESSION_PRESETS)[number];

const OUTPUTS: Record<TargetFormat, { extension: string; mimeType: string }> = {
  WebP: { extension: "webp", mimeType: "image/webp" },
  JPG: { extension: "jpg", mimeType: "image/jpeg" },
  PNG: { extension: "png", mimeType: "image/png" },
  AVIF: { extension: "avif", mimeType: "image/avif" },
  GIF: { extension: "gif", mimeType: "image/gif" },
  TIFF: { extension: "tiff", mimeType: "image/tiff" },
};

export function outputInfo(targetFormat: TargetFormat) {
  return OUTPUTS[targetFormat];
}

export function outputFileName(
  originalName: string,
  targetFormat: TargetFormat,
  operation: JobOperation = "convert",
) {
  const base = originalName
    .replaceAll("\\", "/")
    .split("/")
    .pop()
    ?.replace(/\.[^.]+$/, "")
    .replace(/[^\p{L}\p{N}._ -]+/gu, "_")
    .trim()
    .slice(0, 180);
  const suffix = operation === "compress" ? "-compressed" : "";
  return `${base || "converted"}${suffix}.${OUTPUTS[targetFormat].extension}`;
}
