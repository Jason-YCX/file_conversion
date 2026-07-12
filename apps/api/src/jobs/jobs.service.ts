import { HttpStatus, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { ApiException } from "../common/api-exception";
import { outputFileName, type TargetFormat } from "../conversion/formats";
import { DatabaseService } from "../database/database.service";
import { jobs } from "../database/schema";
import { QueueService } from "../queue/queue.service";
import { StorageService } from "../storage/storage.service";
import { CreateJobDto } from "./dto/create-job.dto";

const QUEUED_MESSAGE = "任务已进入转换队列";

@Injectable()
export class JobsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly storage: StorageService,
    private readonly queue: QueueService,
  ) {}

  async create(input: CreateJobDto) {
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
        quality: input.quality,
        scale: input.scale,
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

    return { ...job, status: "queued" as const, message: QUEUED_MESSAGE };
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
    return this.storage.createDownloadUrl(
      job.outputObjectKey,
      outputFileName(job.originalName, job.targetFormat as TargetFormat),
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
    const output =
      job.status === "completed" && job.outputObjectKey && job.outputMimeType
        ? {
            fileName: outputFileName(job.originalName, job.targetFormat as TargetFormat),
            mimeType: job.outputMimeType,
            size: job.outputByteSize,
            downloadUrl: `/api/v1/jobs/${job.id}/download`,
          }
        : undefined;
    return {
      ...job,
      ...(job.status === "queued" ? { message: QUEUED_MESSAGE } : {}),
      ...(output ? { output } : {}),
    };
  }
}
