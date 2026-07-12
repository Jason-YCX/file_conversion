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
  };
}
