import { HttpStatus } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { DatabaseService } from "../database/database.service";
import { QueueService } from "../queue/queue.service";
import { StorageService } from "../storage/storage.service";
import { CreateJobDto } from "./dto/create-job.dto";
import { JobsService } from "./jobs.service";

const input: CreateJobDto = {
  objectKey: "uploads/file.png",
  fileName: "file.png",
  mimeType: "image/png",
  size: 512,
  sourceFormat: "PNG",
  targetFormat: "WebP",
  quality: 86,
  scale: 1,
};

function createService(object: { size: number; contentType?: string } | null) {
  const job = {
    id: "e6b659c5-ef1a-4f7b-b226-abf380ca5991",
    inputObjectKey: input.objectKey,
    originalName: input.fileName,
    mimeType: input.mimeType,
    byteSize: input.size,
    sourceFormat: input.sourceFormat,
    targetFormat: input.targetFormat,
    quality: input.quality,
    scale: input.scale,
    status: "queued",
    errorMessage: null,
    outputObjectKey: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const returning = vi.fn().mockResolvedValue([job]);
  const values = vi.fn().mockReturnValue({ returning });
  const insert = vi.fn().mockReturnValue({ values });
  const database = { db: { insert } } as unknown as DatabaseService;
  const storage = {
    headObject: vi.fn().mockResolvedValue(object),
  } as unknown as StorageService;
  const queue = { enqueue: vi.fn().mockResolvedValue(undefined) } as unknown as QueueService;

  return { service: new JobsService(database, storage, queue), queue };
}

describe("JobsService", () => {
  it("persists and queues a job after validating the object", async () => {
    const { service, queue } = createService({ size: 512, contentType: "image/png" });

    const result = await service.create(input);

    expect(result.status).toBe("queued");
    expect(result.message).toContain("转换队列");
    expect(queue.enqueue).toHaveBeenCalledWith({ jobId: result.id });
  });

  it("rejects a task when the uploaded object is missing", async () => {
    const { service } = createService(null);

    await expect(service.create(input)).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
    });
  });

  it("rejects a task when the object size differs", async () => {
    const { service } = createService({ size: 511, contentType: "image/png" });

    await expect(service.create(input)).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
    });
  });
});
