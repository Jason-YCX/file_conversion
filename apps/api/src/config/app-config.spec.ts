import { describe, expect, it } from "vitest";
import { validateConfig } from "./app-config";

describe("validateConfig", () => {
  it("uses the internal S3 endpoint for signed URLs by default", () => {
    const config = validateConfig({ S3_ENDPOINT: "http://minio:9000" });

    expect(config.S3_ENDPOINT).toBe("http://minio:9000");
    expect(config.S3_PUBLIC_ENDPOINT).toBe("http://minio:9000");
  });

  it("accepts a browser-reachable public S3 endpoint", () => {
    const config = validateConfig({
      S3_ENDPOINT: "http://minio:9000",
      S3_PUBLIC_ENDPOINT: "https://files.example.com",
    });

    expect(config.S3_ENDPOINT).toBe("http://minio:9000");
    expect(config.S3_PUBLIC_ENDPOINT).toBe("https://files.example.com");
  });
});
