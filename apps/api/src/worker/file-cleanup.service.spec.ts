import { ConfigService } from "@nestjs/config";
import { describe, expect, it, vi } from "vitest";
import { DatabaseService } from "../database/database.service";
import { StorageService } from "../storage/storage.service";
import { FileCleanupService } from "./file-cleanup.service";

describe("FileCleanupService", () => {
  it("deletes old objects and expires durable task metadata", async () => {
    const jobsReturning = vi.fn().mockResolvedValue([{ id: "job-1" }, { id: "job-2" }]);
    const archivesReturning = vi.fn().mockResolvedValue([{ id: "archive-1" }]);
    const jobsWhere = vi.fn().mockReturnValue({ returning: jobsReturning });
    const archivesWhere = vi.fn().mockReturnValue({ returning: archivesReturning });
    const jobsSet = vi.fn().mockReturnValue({ where: jobsWhere });
    const archivesSet = vi.fn().mockReturnValue({ where: archivesWhere });
    const update = vi
      .fn()
      .mockReturnValueOnce({ set: jobsSet })
      .mockReturnValueOnce({ set: archivesSet });
    const database = { db: { update } } as unknown as DatabaseService;
    const storage = {
      deleteObjectsOlderThan: vi.fn().mockResolvedValue(4),
    } as unknown as StorageService;
    const config = {
      getOrThrow: vi.fn().mockReturnValue(7200),
    } as unknown as ConfigService;
    const service = new FileCleanupService(config, database, storage);
    const now = new Date("2026-07-12T12:00:00.000Z");

    await expect(service.cleanup(now)).resolves.toMatchObject({
      cutoff: new Date("2026-07-12T10:00:00.000Z"),
      deletedObjects: 4,
      expiredJobs: 2,
      expiredArchives: 1,
    });
    expect(storage.deleteObjectsOlderThan).toHaveBeenCalledWith(
      ["uploads/", "converted/", "archives/"],
      new Date("2026-07-12T10:00:00.000Z"),
    );
    expect(jobsSet).toHaveBeenCalledWith(expect.objectContaining({ status: "expired" }));
    expect(archivesSet).toHaveBeenCalledWith(expect.objectContaining({ status: "expired" }));
  });
});
