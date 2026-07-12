import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import {
  ARCHIVE_QUEUE,
  CONVERSION_QUEUE,
  CONVERSION_WORKER_HEARTBEAT_KEY,
  type ArchiveQueuePayload,
  type ConversionQueuePayload,
} from "../queue/queue.service";
import { ArchiveProcessor } from "./archive.processor";
import { ConversionProcessor } from "./conversion.processor";
import { FileCleanupService } from "./file-cleanup.service";

const FILE_CLEANUP_LOCK_KEY = "qingzhuan:file-cleanup:lock";

@Injectable()
export class WorkerService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(WorkerService.name);
  private readonly redisUrl: string;
  private readonly conversionConcurrency: number;
  private readonly archiveConcurrency: number;
  private readonly cleanupIntervalSeconds: number;
  private readonly heartbeat: IORedis;
  private conversionWorker?: Worker<ConversionQueuePayload>;
  private archiveWorker?: Worker<ArchiveQueuePayload>;
  private heartbeatTimer?: NodeJS.Timeout;
  private cleanupTimer?: NodeJS.Timeout;

  constructor(
    config: ConfigService,
    private readonly conversions: ConversionProcessor,
    private readonly archiveProcessor: ArchiveProcessor,
    private readonly fileCleanup: FileCleanupService,
  ) {
    this.redisUrl = config.getOrThrow<string>("REDIS_URL");
    this.conversionConcurrency = config.getOrThrow<number>("CONVERSION_WORKER_CONCURRENCY");
    this.archiveConcurrency = config.getOrThrow<number>("ARCHIVE_WORKER_CONCURRENCY");
    this.cleanupIntervalSeconds = config.getOrThrow<number>("FILE_CLEANUP_INTERVAL_SECONDS");
    this.heartbeat = new IORedis(this.redisUrl, { maxRetriesPerRequest: null });
  }

  async onModuleInit() {
    this.conversionWorker = new Worker(
      CONVERSION_QUEUE,
      (job) => this.conversions.process(job.data.jobId),
      { connection: this.connectionOptions(), concurrency: this.conversionConcurrency },
    );
    this.archiveWorker = new Worker(
      ARCHIVE_QUEUE,
      (job) => this.archiveProcessor.process(job.data.archiveId),
      { connection: this.connectionOptions(), concurrency: this.archiveConcurrency },
    );
    this.conversionWorker.on("failed", (job) => void this.handleConversionFailure(job));
    this.archiveWorker.on("failed", (job) => void this.handleArchiveFailure(job));
    this.conversionWorker.on("error", (error) => this.logger.error(error));
    this.archiveWorker.on("error", (error) => this.logger.error(error));
    await this.writeHeartbeat();
    this.heartbeatTimer = setInterval(() => void this.writeHeartbeat(), 10_000);
    await this.runCleanup();
    this.cleanupTimer = setInterval(
      () => void this.runCleanup(),
      this.cleanupIntervalSeconds * 1000,
    );
    this.logger.log("Conversion and archive workers are ready");
  }

  async onApplicationShutdown() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    await Promise.allSettled([
      this.conversionWorker?.close(),
      this.archiveWorker?.close(),
      this.heartbeat.del(CONVERSION_WORKER_HEARTBEAT_KEY),
    ]);
    await this.heartbeat.quit();
  }

  private async handleConversionFailure(job?: Job<ConversionQueuePayload>) {
    if (!job) return;
    const attempts = Number(job.opts.attempts ?? 1);
    if (job.attemptsMade >= attempts) await this.conversions.markFailed(job.data.jobId);
    else await this.conversions.markRetrying(job.data.jobId);
  }

  private async handleArchiveFailure(job?: Job<ArchiveQueuePayload>) {
    if (!job) return;
    const attempts = Number(job.opts.attempts ?? 1);
    if (job.attemptsMade >= attempts) await this.archiveProcessor.markFailed(job.data.archiveId);
    else await this.archiveProcessor.markRetrying(job.data.archiveId);
  }

  private async writeHeartbeat() {
    await this.heartbeat.set(CONVERSION_WORKER_HEARTBEAT_KEY, new Date().toISOString(), "EX", 30);
  }

  private async runCleanup() {
    try {
      const lock = await this.heartbeat.set(
        FILE_CLEANUP_LOCK_KEY,
        `${process.pid}:${Date.now()}`,
        "EX",
        Math.max(60, this.cleanupIntervalSeconds),
        "NX",
      );
      if (lock === "OK") await this.fileCleanup.cleanup();
    } catch (error) {
      this.logger.error("Retention cleanup failed", error instanceof Error ? error.stack : String(error));
    }
  }

  private connectionOptions() {
    const url = new URL(this.redisUrl);
    return {
      host: url.hostname,
      port: Number(url.port || 6379),
      username: url.username || undefined,
      password: url.password || undefined,
      db: Number(url.pathname.slice(1) || 0),
      ...(url.protocol === "rediss:" ? { tls: {} } : {}),
    };
  }
}
