import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { and, eq, ne } from "drizzle-orm";
import { outputFileName } from "../conversion/formats";
import { DatabaseService } from "../database/database.service";
import { jobs } from "../database/schema";
import { StorageService } from "../storage/storage.service";
import {
  ConversionEngineService,
  ImageProcessingError,
} from "./conversion-engine.service";

@Injectable()
export class ConversionProcessor {
  private readonly maxInputPixels: number;
  private readonly timeoutMs: number;

  constructor(
    config: ConfigService,
    private readonly database: DatabaseService,
    private readonly storage: StorageService,
    private readonly engine: ConversionEngineService,
  ) {
    this.maxInputPixels = config.getOrThrow<number>("MAX_INPUT_PIXELS");
    this.timeoutMs = config.getOrThrow<number>("CONVERSION_TIMEOUT_MS");
  }

  async process(jobId: string) {
    const [job] = await this.database.db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
    if (!job) throw new Error("Conversion job not found");
    if (job.status === "completed" && job.outputObjectKey) return;
    if (job.status === "cancelled" || job.status === "expired") return;

    await this.database.db
      .update(jobs)
      .set({ status: "processing", errorMessage: null, updatedAt: new Date() })
      .where(and(eq(jobs.id, jobId), ne(jobs.status, "expired")));

    try {
      const input = await this.storage.getObjectBuffer(job.inputObjectKey);
      const result =
        job.operation === "compress"
          ? await this.engine.compress(input, {
              preset: job.compressionPreset ?? "balanced",
              quality: job.quality,
              scale: job.scale,
              resizeWidth: job.resizeWidth,
              resizeHeight: job.resizeHeight,
              maxInputPixels: this.maxInputPixels,
              timeoutMs: this.timeoutMs,
            })
          : await this.engine.convert(input, {
              targetFormat: job.targetFormat,
              quality: job.quality,
              scale: job.scale,
              maxInputPixels: this.maxInputPixels,
              timeoutMs: this.timeoutMs,
            });
      const fileName = outputFileName(job.originalName, result.targetFormat, job.operation);
      const objectKey = `converted/${job.id}/${fileName}`;
      await this.storage.putObject(objectKey, result.data, result.mimeType);
      await this.database.db
        .update(jobs)
        .set({
          status: "completed",
          detectedSourceFormat: result.detectedSourceFormat,
          resolvedTargetFormat: result.targetFormat,
          outputObjectKey: objectKey,
          outputMimeType: result.mimeType,
          outputByteSize: result.data.length,
          keptOriginal: result.keptOriginal,
          errorCode: null,
          errorMessage: null,
          updatedAt: new Date(),
        })
        .where(and(eq(jobs.id, jobId), ne(jobs.status, "expired")));
    } catch (error) {
      const failure = this.failure(error, job.operation);
      await this.database.db
        .update(jobs)
        .set({
          errorCode: failure.code,
          errorMessage: failure.message,
          updatedAt: new Date(),
        })
        .where(and(eq(jobs.id, jobId), ne(jobs.status, "expired")));
      throw error;
    }
  }

  async markRetrying(jobId: string) {
    await this.database.db
      .update(jobs)
      .set({
        status: "queued",
        errorCode: null,
        errorMessage: "处理失败，正在自动重试",
        updatedAt: new Date(),
      })
      .where(and(eq(jobs.id, jobId), ne(jobs.status, "expired")));
  }

  async markFailed(jobId: string) {
    await this.database.db
      .update(jobs)
      .set({ status: "failed", updatedAt: new Date() })
      .where(and(eq(jobs.id, jobId), ne(jobs.status, "expired")));
  }

  private failure(error: unknown, operation: "convert" | "compress") {
    if (error instanceof ImageProcessingError) {
      return { code: error.code, message: error.message };
    }
    return operation === "compress"
      ? {
          code: "COMPRESSION_FAILED",
          message: "文件无法压缩，请检查格式或文件是否损坏",
        }
      : {
          code: "CONVERSION_FAILED",
          message: "文件无法转换，请检查格式或文件是否损坏",
        };
  }
}
