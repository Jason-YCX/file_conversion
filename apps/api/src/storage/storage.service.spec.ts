import { ConfigService } from "@nestjs/config";
import type { S3Client } from "@aws-sdk/client-s3";
import { describe, expect, it, vi } from "vitest";
import { StorageService } from "./storage.service";

function createService() {
  const values: Record<string, string | number | boolean> = {
    S3_ENDPOINT: "http://minio:9000",
    S3_PUBLIC_ENDPOINT: "https://files.example.com",
    S3_REGION: "us-east-1",
    S3_ACCESS_KEY_ID: "access-key",
    S3_SECRET_ACCESS_KEY: "secret-key",
    S3_BUCKET: "qingzhuan-files",
    S3_FORCE_PATH_STYLE: true,
    UPLOAD_URL_EXPIRES_SECONDS: 900,
    DOWNLOAD_URL_EXPIRES_SECONDS: 900,
  };
  const config = {
    getOrThrow: vi.fn((name: string) => values[name]),
  } as unknown as ConfigService;

  return new StorageService(config) as unknown as {
    client: S3Client;
    signingClient: S3Client;
  };
}

describe("StorageService", () => {
  it("uses separate internal and public endpoints", async () => {
    const service = createService();

    const internalEndpoint = await service.client.config.endpoint!();
    const publicEndpoint = await service.signingClient.config.endpoint!();

    expect(internalEndpoint.hostname).toBe("minio");
    expect(internalEndpoint.port).toBe(9000);
    expect(publicEndpoint.hostname).toBe("files.example.com");
    expect(publicEndpoint.protocol).toBe("https:");
  });
});
