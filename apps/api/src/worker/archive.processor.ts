import { Injectable } from "@nestjs/common";
import archiver = require("archiver");
import { and, eq, inArray, ne } from "drizzle-orm";
import { PassThrough } from "node:stream";
import { outputFileName, type TargetFormat } from "../conversion/formats";
import { DatabaseService } from "../database/database.service";
import { archives, jobs } from "../database/schema";
import { StorageService } from "../storage/storage.service";

@Injectable()
export class ArchiveProcessor {
  constructor(
    private readonly database: DatabaseService,
    private readonly storage: StorageService,
  ) {}

  async process(archiveId: string) {
    const [archiveJob] = await this.database.db
      .select()
      .from(archives)
      .where(eq(archives.id, archiveId))
      .limit(1);
    if (!archiveJob) throw new Error("Archive task not found");
    if (archiveJob.status === "completed" && archiveJob.outputObjectKey) return;
    if (archiveJob.status === "expired") return;

    await this.database.db
      .update(archives)
      .set({ status: "processing", errorMessage: null, updatedAt: new Date() })
      .where(and(eq(archives.id, archiveId), ne(archives.status, "expired")));
    const selected = await this.database.db
      .select()
      .from(jobs)
      .where(inArray(jobs.id, archiveJob.jobIds));
    const byId = new Map(selected.map((job) => [job.id, job]));
    const ordered = archiveJob.jobIds.map((id) => byId.get(id));
    if (ordered.some((job) => !job || job.status !== "completed" || !job.outputObjectKey)) {
      throw new Error("Archive contains unfinished jobs");
    }

    const zip = archiver("zip", { zlib: { level: 6 } });
    const output = new PassThrough();
    let outputSize = 0;
    output.on("data", (chunk: Buffer) => {
      outputSize += chunk.length;
    });
    zip.pipe(output);
    const objectKey = `archives/${archiveId}/qingzhuan-${archiveId}.zip`;
    const upload = this.storage.uploadStream(objectKey, output, "application/zip");
    const names = new Map<string, number>();
    for (const job of ordered) {
      if (!job?.outputObjectKey) continue;
      const baseName = outputFileName(job.originalName, job.targetFormat as TargetFormat);
      const count = names.get(baseName) ?? 0;
      names.set(baseName, count + 1);
      const name = count === 0 ? baseName : this.numberedName(baseName, count + 1);
      zip.append(await this.storage.getObjectStream(job.outputObjectKey), { name });
    }
    await Promise.all([zip.finalize(), upload]);
    await this.database.db
      .update(archives)
      .set({
        status: "completed",
        outputObjectKey: objectKey,
        outputByteSize: outputSize,
        errorMessage: null,
        updatedAt: new Date(),
      })
      .where(and(eq(archives.id, archiveId), ne(archives.status, "expired")));
  }

  async markRetrying(archiveId: string) {
    await this.database.db
      .update(archives)
      .set({ status: "queued", errorMessage: "打包失败，正在自动重试", updatedAt: new Date() })
      .where(and(eq(archives.id, archiveId), ne(archives.status, "expired")));
  }

  async markFailed(archiveId: string) {
    await this.database.db
      .update(archives)
      .set({ status: "failed", errorMessage: "生成压缩包失败，请稍后重试", updatedAt: new Date() })
      .where(and(eq(archives.id, archiveId), ne(archives.status, "expired")));
  }

  private numberedName(fileName: string, number: number) {
    const dot = fileName.lastIndexOf(".");
    return dot > 0
      ? `${fileName.slice(0, dot)} (${number})${fileName.slice(dot)}`
      : `${fileName} (${number})`;
  }
}
