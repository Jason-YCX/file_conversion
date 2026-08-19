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
    resolvedTargetFormat: input.targetFormat,
    operation: "convert",
    compressionPreset: null,
    quality: input.quality,
    scale: input.scale,
    resizeWidth: null,
    resizeHeight: null,
    status: "queued",
    errorCode: null,
    errorMessage: null,
    outputObjectKey: null,
    outputMimeType: null,
    outputByteSize: null,
    keptOriginal: false,
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

function createReadService() {
  const job = {
    id: "e6b659c5-ef1a-4f7b-b226-abf380ca5991",
    inputObjectKey: "uploads/file.jpg",
    originalName: "photo.jpg",
    mimeType: "image/jpeg",
    byteSize: 1000,
    sourceFormat: "自动识别",
    detectedSourceFormat: "JPG",
    targetFormat: "original",
    resolvedTargetFormat: "JPG",
    operation: "compress",
    compressionPreset: "balanced",
    quality: 80,
    scale: 1,
    resizeWidth: null,
    resizeHeight: null,
    status: "completed",
    errorCode: null,
    errorMessage: null,
    outputObjectKey: "converted/job/photo-compressed.jpg",
    outputMimeType: "image/jpeg",
    outputByteSize: 400,
    keptOriginal: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as const;
  const limit = vi.fn().mockResolvedValue([job]);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  const select = vi.fn().mockReturnValue({ from });
  const database = { db: { select } } as unknown as DatabaseService;
  const storage = {
    createDownloadUrl: vi.fn().mockResolvedValue("https://storage.test/download"),
  } as unknown as StorageService;
  const queue = {} as QueueService;
  return { service: new JobsService(database, storage, queue), storage };
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

  it("accepts an original-format compression task", async () => {
    const { service, queue } = createService({ size: 512, contentType: "image/png" });
    const result = await service.create({
      ...input,
      operation: "compress",
      sourceFormat: "自动识别",
      targetFormat: "original",
      compressionPreset: "balanced",
    });

    expect(result.message).toContain("压缩队列");
    expect(queue.enqueue).toHaveBeenCalled();
  });

  it("rejects incompatible compression and conversion options", async () => {
    const { service } = createService({ size: 512, contentType: "image/png" });

    await expect(
      service.create({ ...input, targetFormat: "original" }).catch((error) => error.getResponse()),
    ).resolves.toMatchObject({ code: "INVALID_TARGET_FORMAT" });
    await expect(
      service
        .create({ ...input, operation: "compress", compressionPreset: "balanced" })
        .catch((error) => error.getResponse()),
    ).resolves.toMatchObject({ code: "INVALID_TARGET_FORMAT" });
    await expect(
      service.create({
        ...input,
        operation: "compress",
        targetFormat: "original",
        compressionPreset: "balanced",
        scale: 0.5,
        resizeWidth: 800,
      }).catch((error) => error.getResponse()),
    ).resolves.toMatchObject({ code: "INVALID_RESIZE_OPTIONS" });
  });

  it("returns compression statistics and a compressed file name", async () => {
    const { service, storage } = createReadService();

    const result = await service.findOne("e6b659c5-ef1a-4f7b-b226-abf380ca5991");
    expect(result.output).toMatchObject({
      fileName: "photo-compressed.jpg",
      originalSize: 1000,
      size: 400,
      savedBytes: 600,
      savingRate: 60,
      keptOriginal: false,
    });

    await expect(
      service.download("e6b659c5-ef1a-4f7b-b226-abf380ca5991"),
    ).resolves.toBe("https://storage.test/download");
    expect(storage.createDownloadUrl).toHaveBeenCalledWith(
      "converted/job/photo-compressed.jpg",
      "photo-compressed.jpg",
      "image/jpeg",
    );
  });
});
