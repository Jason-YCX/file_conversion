import { HttpStatus, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { ApiException } from "../common/api-exception";
import { DatabaseService } from "../database/database.service";
import { jobs } from "../database/schema";
import { QueueService } from "../queue/queue.service";
import { StorageService } from "../storage/storage.service";
import { CreateJobDto } from "./dto/create-job.dto";

const QUEUED_MESSAGE = "任务已进入队列，当前版本尚未启用转换引擎";

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
      await this.queue.enqueue({
        jobId: job.id,
        inputObjectKey: job.inputObjectKey,
        targetFormat: job.targetFormat,
        quality: job.quality,
        scale: job.scale,
      });
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

    return {
      ...job,
      ...(job.status === "queued" ? { message: QUEUED_MESSAGE } : {}),
    };
  }
}
