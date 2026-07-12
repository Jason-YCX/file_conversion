import { Injectable, OnApplicationShutdown } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Queue, type ConnectionOptions } from "bullmq";
import IORedis from "ioredis";

export const CONVERSION_QUEUE = "conversion";
export const ARCHIVE_QUEUE = "archive";
export const CONVERSION_WORKER_HEARTBEAT_KEY = "qingzhuan:worker:heartbeat";

export type ConversionQueuePayload = {
  jobId: string;
};

export type ArchiveQueuePayload = { archiveId: string };

@Injectable()
export class QueueService implements OnApplicationShutdown {
  private queue?: Queue<ConversionQueuePayload>;
  private archiveQueue?: Queue<ArchiveQueuePayload>;
  private readonly healthConnection: IORedis;
  private readonly queueConnection: ConnectionOptions;

  constructor(config: ConfigService) {
    const redisUrl = config.getOrThrow<string>("REDIS_URL");
    this.queueConnection = this.connectionOptions(redisUrl);
    this.healthConnection = new IORedis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
    });
    this.healthConnection.on("error", () => undefined);
  }

  async enqueue(payload: ConversionQueuePayload) {
    await this.getQueue().add("convert", payload, { jobId: payload.jobId });
  }

  async enqueueArchive(payload: ArchiveQueuePayload) {
    await this.getArchiveQueue().add("archive", payload, { jobId: payload.archiveId });
  }

  async isWorkerAlive() {
    if (this.healthConnection.status === "wait") await this.healthConnection.connect();
    return Boolean(await this.healthConnection.get(CONVERSION_WORKER_HEARTBEAT_KEY));
  }

  async ping() {
    if (this.healthConnection.status === "wait") {
      await this.healthConnection.connect();
    }
    await this.healthConnection.ping();
  }

  async onApplicationShutdown() {
    const closeHealth =
      this.healthConnection.status === "wait"
        ? Promise.resolve(this.healthConnection.disconnect())
        : this.healthConnection.quit();
    await Promise.allSettled([
      ...(this.queue ? [this.queue.close()] : []),
      ...(this.archiveQueue ? [this.archiveQueue.close()] : []),
      closeHealth,
    ]);
  }


  private getArchiveQueue() {
    if (!this.archiveQueue) {
      this.archiveQueue = new Queue(ARCHIVE_QUEUE, {
        connection: this.queueConnection,
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: "exponential", delay: 2_000 },
          removeOnComplete: 100,
          removeOnFail: 500,
        },
      });
      this.archiveQueue.on("error", () => undefined);
    }
    return this.archiveQueue;
  }

  private getQueue() {
    if (!this.queue) {
      this.queue = new Queue(CONVERSION_QUEUE, {
        connection: this.queueConnection,
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: "exponential", delay: 2_000 },
          removeOnComplete: 100,
          removeOnFail: 500,
        },
      });
      this.queue.on("error", () => undefined);
    }
    return this.queue;
  }

  private connectionOptions(redisUrl: string) {
    const url = new URL(redisUrl);
    const database = Number(url.pathname.slice(1) || 0);
    return {
      host: url.hostname,
      port: Number(url.port || 6379),
      username: url.username || undefined,
      password: url.password || undefined,
      db: database,
      ...(url.protocol === "rediss:" ? { tls: {} } : {}),
    };
  }
}
