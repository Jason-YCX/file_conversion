import { HttpStatus, Injectable } from "@nestjs/common";
import { eq, inArray } from "drizzle-orm";
import { ApiException } from "../common/api-exception";
import { DatabaseService } from "../database/database.service";
import { archives, jobs } from "../database/schema";
import { QueueService } from "../queue/queue.service";
import { StorageService } from "../storage/storage.service";
import { CreateArchiveDto } from "./dto/create-archive.dto";

@Injectable()
export class ArchivesService {
  constructor(
    private readonly database: DatabaseService,
    private readonly queue: QueueService,
    private readonly storage: StorageService,
  ) {}

  async create(input: CreateArchiveDto) {
    const selected = await this.database.db
      .select({ id: jobs.id, status: jobs.status })
      .from(jobs)
      .where(inArray(jobs.id, input.jobIds));
    if (selected.length !== input.jobIds.length) {
      throw new ApiException(HttpStatus.NOT_FOUND, "JOB_NOT_FOUND", "部分转换任务不存在");
    }
    if (selected.some((job) => job.status !== "completed")) {
      throw new ApiException(HttpStatus.CONFLICT, "JOBS_NOT_READY", "请等待所有文件转换完成");
    }

    const [archive] = await this.database.db
      .insert(archives)
      .values({ jobIds: input.jobIds, status: "queued" })
      .returning();
    try {
      await this.queue.enqueueArchive({ archiveId: archive.id });
    } catch {
      await this.database.db
        .update(archives)
        .set({ status: "failed", errorMessage: "打包队列暂时不可用", updatedAt: new Date() })
        .where(eq(archives.id, archive.id));
      throw new ApiException(
        HttpStatus.SERVICE_UNAVAILABLE,
        "ARCHIVE_QUEUE_UNAVAILABLE",
        "打包队列暂时不可用，请稍后重试",
      );
    }
    return this.toResponse(archive);
  }

  async findOne(id: string) {
    return this.toResponse(await this.getArchive(id));
  }

  async download(id: string) {
    const archive = await this.getArchive(id);
    if (archive.status === "expired") {
      throw new ApiException(
        HttpStatus.GONE,
        "FILE_EXPIRED",
        "压缩包已超过2小时保存期限并自动删除",
      );
    }
    if (archive.status !== "completed" || !archive.outputObjectKey) {
      throw new ApiException(HttpStatus.CONFLICT, "ARCHIVE_NOT_COMPLETED", "压缩包尚未生成完成");
    }
    return this.storage.createDownloadUrl(
      archive.outputObjectKey,
      `qingzhuan-${archive.id}.zip`,
      "application/zip",
    );
  }

  private async getArchive(id: string) {
    const [archive] = await this.database.db
      .select()
      .from(archives)
      .where(eq(archives.id, id))
      .limit(1);
    if (!archive) {
      throw new ApiException(HttpStatus.NOT_FOUND, "ARCHIVE_NOT_FOUND", "没有找到对应的压缩任务");
    }
    return archive;
  }

  private toResponse(archive: typeof archives.$inferSelect) {
    return {
      ...archive,
      ...(archive.status === "completed"
        ? {
            output: {
              fileName: `qingzhuan-${archive.id}.zip`,
              mimeType: "application/zip",
              size: archive.outputByteSize,
              downloadUrl: `/api/v1/archives/${archive.id}/download`,
            },
          }
        : {}),
    };
  }
}
