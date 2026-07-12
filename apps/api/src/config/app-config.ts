function numberValue(value: unknown, fallback: number, name: string) {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive number`);
  }
  return parsed;
}

export function validateConfig(input: Record<string, unknown>) {
  return {
    ...input,
    PORT: numberValue(input.PORT, 4000, "PORT"),
    CORS_ORIGINS: String(input.CORS_ORIGINS ?? "http://localhost:3000"),
    DATABASE_URL: String(
      input.DATABASE_URL ??
        "postgresql://qingzhuan:qingzhuan@localhost:5432/qingzhuan",
    ),
    REDIS_URL: String(input.REDIS_URL ?? "redis://localhost:6379"),
    S3_ENDPOINT: String(input.S3_ENDPOINT ?? "http://localhost:9000"),
    S3_REGION: String(input.S3_REGION ?? "us-east-1"),
    S3_ACCESS_KEY_ID: String(input.S3_ACCESS_KEY_ID ?? "qingzhuan"),
    S3_SECRET_ACCESS_KEY: String(
      input.S3_SECRET_ACCESS_KEY ?? "qingzhuan-secret",
    ),
    S3_BUCKET: String(input.S3_BUCKET ?? "qingzhuan-files"),
    S3_FORCE_PATH_STYLE:
      String(input.S3_FORCE_PATH_STYLE ?? "true").toLowerCase() === "true",
    UPLOAD_URL_EXPIRES_SECONDS: numberValue(
      input.UPLOAD_URL_EXPIRES_SECONDS,
      900,
      "UPLOAD_URL_EXPIRES_SECONDS",
    ),
    MAX_UPLOAD_BYTES: numberValue(
      input.MAX_UPLOAD_BYTES,
      50 * 1024 * 1024,
      "MAX_UPLOAD_BYTES",
    ),
    DOWNLOAD_URL_EXPIRES_SECONDS: numberValue(
      input.DOWNLOAD_URL_EXPIRES_SECONDS,
      900,
      "DOWNLOAD_URL_EXPIRES_SECONDS",
    ),
    CONVERSION_WORKER_CONCURRENCY: numberValue(
      input.CONVERSION_WORKER_CONCURRENCY,
      2,
      "CONVERSION_WORKER_CONCURRENCY",
    ),
    ARCHIVE_WORKER_CONCURRENCY: numberValue(
      input.ARCHIVE_WORKER_CONCURRENCY,
      1,
      "ARCHIVE_WORKER_CONCURRENCY",
    ),
    CONVERSION_TIMEOUT_MS: numberValue(
      input.CONVERSION_TIMEOUT_MS,
      180_000,
      "CONVERSION_TIMEOUT_MS",
    ),
    MAX_INPUT_PIXELS: numberValue(
      input.MAX_INPUT_PIXELS,
      40_000_000,
      "MAX_INPUT_PIXELS",
    ),
    FILE_RETENTION_SECONDS: numberValue(
      input.FILE_RETENTION_SECONDS,
      2 * 60 * 60,
      "FILE_RETENTION_SECONDS",
    ),
    FILE_CLEANUP_INTERVAL_SECONDS: numberValue(
      input.FILE_CLEANUP_INTERVAL_SECONDS,
      10 * 60,
      "FILE_CLEANUP_INTERVAL_SECONDS",
    ),
  };
}
