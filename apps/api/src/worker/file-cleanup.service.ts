import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { and, lte, ne } from "drizzle-orm";
import { DatabaseService } from "../database/database.service";
import { archives, jobs } from "../database/schema";
import { StorageService } from "../storage/storage.service";

@Injectable()
export class FileCleanupService {
  private readonly logger = new Logger(FileCleanupService.name);
  private readonly retentionMs: number;

  constructor(
    config: ConfigService,
    private readonly database: DatabaseService,
    private readonly storage: StorageService,
  ) {
    this.retentionMs = config.getOrThrow<number>("FILE_RETENTION_SECONDS") * 1000;
  }

  async cleanup(now = new Date()) {
    const cutoff = new Date(now.getTime() - this.retentionMs);
    const deletedObjects = await this.storage.deleteObjectsOlderThan(
      ["uploads/", "converted/", "archives/"],
      cutoff,
    );
    const expiredJobs = await this.database.db
      .update(jobs)
      .set({
        status: "expired",
        errorMessage: "文件已超过2小时保存期限，已自动删除",
        outputObjectKey: null,
        outputMimeType: null,
        outputByteSize: null,
        updatedAt: now,
      })
      .where(and(lte(jobs.createdAt, cutoff), ne(jobs.status, "expired")))
      .returning({ id: jobs.id });
    const expiredArchives = await this.database.db
      .update(archives)
      .set({
        status: "expired",
        errorMessage: "压缩包已超过2小时保存期限，已自动删除",
        outputObjectKey: null,
        outputByteSize: null,
        updatedAt: now,
      })
      .where(and(lte(archives.createdAt, cutoff), ne(archives.status, "expired")))
      .returning({ id: archives.id });
    this.logger.log(
      `Retention cleanup finished: ${deletedObjects} objects, ${expiredJobs.length} jobs, ${expiredArchives.length} archives`,
    );
    return {
      cutoff,
      deletedObjects,
      expiredJobs: expiredJobs.length,
      expiredArchives: expiredArchives.length,
    };
  }
}
