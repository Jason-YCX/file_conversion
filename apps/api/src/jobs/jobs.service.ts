import { HttpStatus, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { ApiException } from "../common/api-exception";
import {
  COMPRESSIBLE_FORMATS,
  ORIGINAL_TARGET_FORMAT,
  outputFileName,
  type JobOperation,
  type TargetFormat,
} from "../conversion/formats";
import { DatabaseService } from "../database/database.service";
import { jobs } from "../database/schema";
import { QueueService } from "../queue/queue.service";
import { StorageService } from "../storage/storage.service";
import { CreateJobDto } from "./dto/create-job.dto";

const QUEUED_MESSAGE = "任务已进入转换队列";
const COMPRESSION_QUEUED_MESSAGE = "任务已进入压缩队列";

@Injectable()
export class JobsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly storage: StorageService,
    private readonly queue: QueueService,
  ) {}

  async create(input: CreateJobDto) {
    const operation = input.operation ?? "convert";
    this.validateRequest(input, operation);
    const object = await this.storage.headObject(input.objectKey);
    if (!object) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        "STORAGE_OBJECT_NOT_FOUND",
        "上传文件不存在，请重新上传",
      );
    }
    if (object.size !== input.size) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        "STORAGE_OBJECT_SIZE_MISMATCH",
        "上传文件大小与任务信息不一致",
        { expected: input.size, actual: object.size },
      );
    }
    if (object.contentType && object.contentType !== input.mimeType) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        "STORAGE_OBJECT_TYPE_MISMATCH",
        "上传文件类型与任务信息不一致",
      );
    }

    const [job] = await this.database.db
      .insert(jobs)
      .values({
        inputObjectKey: input.objectKey,
        originalName: input.fileName,
        mimeType: input.mimeType,
        byteSize: input.size,
        sourceFormat: input.sourceFormat,
        targetFormat: input.targetFormat,
        resolvedTargetFormat:
          operation === "convert" ? input.targetFormat : null,
        operation,
        compressionPreset: input.compressionPreset ?? null,
        quality: input.quality,
        scale: input.scale,
        resizeWidth: input.resizeWidth ?? null,
        resizeHeight: input.resizeHeight ?? null,
        status: "queued",
      })
      .returning();

    try {
      await this.queue.enqueue({ jobId: job.id });
    } catch {
      await this.database.db
        .update(jobs)
        .set({
          status: "failed",
          errorMessage: "任务队列暂时不可用",
          updatedAt: new Date(),
        })
        .where(eq(jobs.id, job.id));
      throw new ApiException(
        HttpStatus.SERVICE_UNAVAILABLE,
        "QUEUE_UNAVAILABLE",
        "任务队列暂时不可用，请稍后重试",
      );
    }

    return {
      ...job,
      status: "queued" as const,
      message: operation === "compress" ? COMPRESSION_QUEUED_MESSAGE : QUEUED_MESSAGE,
    };
  }

  async findOne(id: string) {
    return this.toResponse(await this.getJob(id));
  }

  async download(id: string) {
    const job = await this.getJob(id);
    if (job.status === "expired") {
      throw new ApiException(
        HttpStatus.GONE,
        "FILE_EXPIRED",
        "文件已超过2小时保存期限并自动删除",
      );
    }
    if (job.status !== "completed" || !job.outputObjectKey || !job.outputMimeType) {
      throw new ApiException(
        HttpStatus.CONFLICT,
        "JOB_NOT_COMPLETED",
        "转换任务尚未完成",
      );
    }
    const targetFormat = this.outputFormat(job);
    return this.storage.createDownloadUrl(
      job.outputObjectKey,
      outputFileName(job.originalName, targetFormat, job.operation),
      job.outputMimeType,
    );
  }

  private async getJob(id: string) {
    const [job] = await this.database.db
      .select()
      .from(jobs)
      .where(eq(jobs.id, id))
      .limit(1);

    if (!job) {
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        "JOB_NOT_FOUND",
        "没有找到对应的转换任务",
      );
    }

    return job;
  }

  private toResponse(job: typeof jobs.$inferSelect) {
    const targetFormat = this.outputFormat(job);
    const output =
      job.status === "completed" && job.outputObjectKey && job.outputMimeType
        ? {
            fileName: outputFileName(job.originalName, targetFormat, job.operation),
            mimeType: job.outputMimeType,
            size: job.outputByteSize,
            downloadUrl: `/api/v1/jobs/${job.id}/download`,
            ...(job.operation === "compress" && job.outputByteSize !== null
              ? {
                  originalSize: job.byteSize,
                  savedBytes: Math.max(0, job.byteSize - job.outputByteSize),
                  savingRate: Number(
                    ((Math.max(0, job.byteSize - job.outputByteSize) / job.byteSize) * 100).toFixed(2),
                  ),
                  keptOriginal: job.keptOriginal,
                }
              : {}),
          }
        : undefined;
    return {
      ...job,
      ...(job.status === "queued"
        ? {
            message:
              job.operation === "compress" ? COMPRESSION_QUEUED_MESSAGE : QUEUED_MESSAGE,
          }
        : {}),
      ...(output ? { output } : {}),
    };
  }

  private outputFormat(job: typeof jobs.$inferSelect) {
    return (job.resolvedTargetFormat ?? job.targetFormat) as TargetFormat;
  }

  private validateRequest(input: CreateJobDto, operation: JobOperation) {
    if (operation === "convert") {
      if (input.targetFormat === ORIGINAL_TARGET_FORMAT) {
        throw new ApiException(
          HttpStatus.BAD_REQUEST,
          "INVALID_TARGET_FORMAT",
          "格式转换任务必须指定具体目标格式",
        );
      }
      if (input.compressionPreset || input.resizeWidth || input.resizeHeight) {
        throw new ApiException(
          HttpStatus.BAD_REQUEST,
          "INVALID_JOB_OPTIONS",
          "格式转换任务不能使用图片压缩专用参数",
        );
      }
      return;
    }

    if (input.targetFormat !== ORIGINAL_TARGET_FORMAT) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        "INVALID_TARGET_FORMAT",
        "图片压缩任务必须保持原格式",
      );
    }
    if (!input.compressionPreset) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        "COMPRESSION_PRESET_REQUIRED",
        "请选择压缩档位",
      );
    }
    if (
      input.sourceFormat !== "自动识别" &&
      !COMPRESSIBLE_FORMATS.includes(input.sourceFormat as (typeof COMPRESSIBLE_FORMATS)[number])
    ) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        "UNSUPPORTED_COMPRESSION_FORMAT",
        "当前格式不支持原格式压缩，请使用格式转换",
      );
    }
    if ((input.resizeWidth || input.resizeHeight) && input.scale !== 1) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        "INVALID_RESIZE_OPTIONS",
        "自定义尺寸不能与比例缩放同时使用",
      );
    }
  }
}
