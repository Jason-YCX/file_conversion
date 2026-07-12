import { HttpStatus } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { describe, expect, it, vi } from "vitest";
import { StorageService } from "../storage/storage.service";
import { UploadsService } from "./uploads.service";

function createService(maxUploadBytes = 1024) {
  const config = {
    getOrThrow: vi.fn().mockReturnValue(maxUploadBytes),
  } as unknown as ConfigService;
  const storage = {
    createUpload: vi.fn().mockResolvedValue({ objectKey: "uploads/file.png" }),
  } as unknown as StorageService;
  return { service: new UploadsService(config, storage), storage };
}

describe("UploadsService", () => {
  it("creates a signed upload for an image within the configured limit", async () => {
    const { service, storage } = createService();

    await expect(
      service.presign({ fileName: "a.png", mimeType: "image/png", size: 512 }),
    ).resolves.toEqual({ objectKey: "uploads/file.png" });
    expect(storage.createUpload).toHaveBeenCalledWith("a.png", "image/png");
  });

  it("rejects non-image content", async () => {
    const { service } = createService();

    await expect(
      service.presign({ fileName: "a.pdf", mimeType: "application/pdf", size: 512 }),
    ).rejects.toMatchObject({
      status: HttpStatus.UNSUPPORTED_MEDIA_TYPE,
    });
  });

  it("rejects BMP uploads", async () => {
    const { service } = createService();

    await expect(
      service.presign({ fileName: "a.bmp", mimeType: "image/bmp", size: 512 }),
    ).rejects.toMatchObject({
      status: HttpStatus.UNSUPPORTED_MEDIA_TYPE,
      response: { code: "UNSUPPORTED_FILE_TYPE" },
    });
  });

  it("rejects an oversized image", async () => {
    const { service } = createService(100);

    await expect(
      service.presign({ fileName: "a.png", mimeType: "image/png", size: 101 }),
    ).rejects.toMatchObject({ status: HttpStatus.PAYLOAD_TOO_LARGE });
  });
});
