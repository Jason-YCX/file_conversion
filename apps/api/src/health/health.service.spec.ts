import { describe, expect, it, vi } from "vitest";
import { DatabaseService } from "../database/database.service";
import { QueueService } from "../queue/queue.service";
import { StorageService } from "../storage/storage.service";
import { HealthService } from "./health.service";

describe("HealthService", () => {
  it("reports ok only when all dependencies respond", async () => {
    const service = new HealthService(
      { ping: vi.fn().mockResolvedValue(undefined) } as unknown as DatabaseService,
      {
        ping: vi.fn().mockResolvedValue(undefined),
        isWorkerAlive: vi.fn().mockResolvedValue(true),
      } as unknown as QueueService,
      { ping: vi.fn().mockResolvedValue(undefined) } as unknown as StorageService,
    );

    await expect(service.check()).resolves.toMatchObject({
      status: "ok",
      conversionEngine: "enabled",
      services: { database: "up", redis: "up", storage: "up" },
    });
  });

  it("reports degraded when one dependency is unavailable", async () => {
    const service = new HealthService(
      { ping: vi.fn().mockRejectedValue(new Error("down")) } as unknown as DatabaseService,
      {
        ping: vi.fn().mockResolvedValue(undefined),
        isWorkerAlive: vi.fn().mockResolvedValue(false),
      } as unknown as QueueService,
      { ping: vi.fn().mockResolvedValue(undefined) } as unknown as StorageService,
    );

    await expect(service.check()).resolves.toMatchObject({
      status: "degraded",
      services: { database: "down", redis: "up", storage: "up" },
    });
  });
});
