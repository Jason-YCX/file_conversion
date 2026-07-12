import { Injectable } from "@nestjs/common";
import heicDecode = require("heic-decode");
import type sharpFactory from "sharp";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  TARGET_FORMATS,
  outputInfo,
  type TargetFormat,
} from "../conversion/formats";

const sharp: typeof sharpFactory = require("sharp");
const ffmpegPath = require("ffmpeg-static") as string | null;

export type ConversionResult = {
  data: Buffer;
  detectedSourceFormat: string;
  mimeType: string;
  extension: string;
};

type SharpPipeline = ReturnType<typeof sharp>;
type SharpMetadata = Awaited<ReturnType<SharpPipeline["metadata"]>>;

@Injectable()
export class ConversionEngineService {
  private readonly animatedTargets = new Set<TargetFormat>(["GIF", "WebP", "AVIF"]);

  constructor() {
    sharp.concurrency(1);
  }

  async convert(
    input: Buffer,
    options: {
      targetFormat: string;
      quality: number;
      scale: number;
      maxInputPixels: number;
      timeoutMs: number;
    },
  ): Promise<ConversionResult> {
    if (!TARGET_FORMATS.includes(options.targetFormat as TargetFormat)) {
      throw new Error("Unsupported target format");
    }
    const targetFormat = options.targetFormat as TargetFormat;
    const source = await this.createSource(input, targetFormat, options.maxInputPixels);
    let pipeline = source.pipeline.autoOrient().toColorspace("srgb");
    if (options.scale < 1) {
      const oriented = source.metadata.autoOrient as
        | { width?: number; height?: number }
        | undefined;
      const width = oriented?.width ?? source.metadata.width;
      if (!width) throw new Error("Unable to determine image dimensions");
      pipeline = pipeline.resize({
        width: Math.max(1, Math.round(width * options.scale)),
      });
    }
    pipeline.timeout({ seconds: Math.max(1, Math.ceil(options.timeoutMs / 1000)) });
    const data =
      targetFormat === "AVIF" && source.preserveAnimation
        ? await this.encodeAnimatedAvif(
            await pipeline.gif({ effort: 7, colours: 256, dither: 1 }).toBuffer(),
            options.quality,
            options.timeoutMs,
          )
        : (await this.encode(pipeline, targetFormat, options.quality).toBuffer());
    const output = outputInfo(targetFormat);
    return {
      data,
      detectedSourceFormat: source.detectedSourceFormat,
      mimeType: output.mimeType,
      extension: output.extension,
    };
  }

  private async createSource(
    input: Buffer,
    targetFormat: TargetFormat,
    maxInputPixels: number,
  ) {
    if (this.isHeic(input)) {
      const decoded = await heicDecode({ buffer: input });
      const data = Buffer.from(decoded.data.buffer, decoded.data.byteOffset, decoded.data.byteLength);
      return {
        detectedSourceFormat: "HEIC",
        preserveAnimation: false,
        metadata: { width: decoded.width, height: decoded.height } as SharpMetadata,
        pipeline: sharp(data, {
          raw: { width: decoded.width, height: decoded.height, channels: 4 },
          limitInputPixels: maxInputPixels,
        }),
      };
    }
    const probe = sharp(input, { limitInputPixels: maxInputPixels, failOn: "warning" });
    const metadata = await probe.metadata();
    const detectedSourceFormat = this.detectedFormat(metadata, input);
    const preserveAnimation =
      this.animatedTargets.has(targetFormat) &&
      ["GIF", "WebP", "TIFF"].includes(detectedSourceFormat) &&
      (metadata.pages ?? 1) > 1;
    return {
      detectedSourceFormat,
      preserveAnimation,
      metadata,
      pipeline: sharp(input, {
        limitInputPixels: maxInputPixels,
        failOn: "warning",
        ...(preserveAnimation ? { animated: true } : { page: 0, pages: 1 }),
      }),
    };
  }

  private encode(pipeline: SharpPipeline, target: TargetFormat, quality: number) {
    switch (target) {
      case "JPG":
        return pipeline
          .flatten({ background: "#ffffff" })
          .jpeg({ quality, mozjpeg: true });
      case "PNG":
        return pipeline.png({ compressionLevel: 9, adaptiveFiltering: true });
      case "WebP":
        return pipeline.webp({ quality, effort: 4 });
      case "AVIF":
        return pipeline.avif({ quality, effort: 4 });
      case "GIF": {
        const colours = Math.max(32, Math.min(256, Math.round(32 + ((quality - 40) / 60) * 224)));
        return pipeline.gif({ effort: 7, colours, dither: 1 });
      }
      case "TIFF":
        return pipeline.tiff({ compression: "deflate" });
    }
  }

  private async encodeAnimatedAvif(input: Buffer, quality: number, timeoutMs: number) {
    if (!ffmpegPath) throw new Error("Animated AVIF encoder is unavailable");
    const directory = await mkdtemp(join(tmpdir(), "qingzhuan-avif-"));
    const inputPath = join(directory, "input.gif");
    const outputPath = join(directory, "output.avif");
    try {
      await writeFile(inputPath, input);
      const crf = Math.max(8, Math.min(55, Math.round(63 - quality * 0.55)));
      await new Promise<void>((resolve, reject) => {
        const child = spawn(
          ffmpegPath,
          [
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            inputPath,
            "-an",
            "-c:v",
            "libaom-av1",
            "-crf",
            String(crf),
            "-cpu-used",
            "6",
            "-still-picture",
            "0",
            "-pix_fmt",
            "yuv420p",
            outputPath,
          ],
          { stdio: ["ignore", "ignore", "pipe"] },
        );
        let errorText = "";
        child.stderr.on("data", (chunk: Buffer) => {
          errorText = `${errorText}${chunk.toString()}`.slice(-2000);
        });
        const timer = setTimeout(() => {
          child.kill("SIGKILL");
          reject(new Error("Animated AVIF conversion timed out"));
        }, timeoutMs);
        child.once("error", (error) => {
          clearTimeout(timer);
          reject(error);
        });
        child.once("exit", (code) => {
          clearTimeout(timer);
          if (code === 0) resolve();
          else reject(new Error(errorText || `Animated AVIF encoder exited with ${code}`));
        });
      });
      return await readFile(outputPath);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }

  private detectedFormat(metadata: SharpMetadata, input: Buffer) {
    if (this.isAvif(input)) return "AVIF";
    const formats: Record<string, string> = {
      jpeg: "JPG",
      png: "PNG",
      webp: "WebP",
      avif: "AVIF",
      heif: "AVIF",
      gif: "GIF",
      tiff: "TIFF",
      svg: "SVG",
    };
    const detected = metadata.format ? formats[metadata.format] : undefined;
    if (!detected) throw new Error("Unsupported or unrecognized image format");
    return detected;
  }

  private isHeic(input: Buffer) {
    const brand = this.ftypBrand(input);
    return ["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"].includes(brand);
  }

  private isAvif(input: Buffer) {
    return ["avif", "avis"].includes(this.ftypBrand(input));
  }

  private ftypBrand(input: Buffer) {
    if (input.length < 12 || input.toString("ascii", 4, 8) !== "ftyp") return "";
    return input.toString("ascii", 8, 12).toLowerCase();
  }
}
