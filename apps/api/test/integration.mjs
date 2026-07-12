import assert from "node:assert/strict";
import { DeleteObjectCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Queue } from "bullmq";
import pg from "pg";

const apiBase = process.env.API_BASE_URL ?? "http://localhost:4000/api/v1";
const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://qingzhuan:qingzhuan@localhost:5432/qingzhuan";
const redisUrl = new URL(process.env.REDIS_URL ?? "redis://localhost:6379");
const bucket = process.env.S3_BUCKET ?? "qingzhuan-files";
const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT ?? "http://localhost:9000",
  region: process.env.S3_REGION ?? "us-east-1",
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "qingzhuan",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "qingzhuan-secret",
  },
});
const queue = new Queue("conversion", {
  connection: {
    host: redisUrl.hostname,
    port: Number(redisUrl.port || 6379),
    db: Number(redisUrl.pathname.slice(1) || 0),
  },
});
const pool = new pg.Pool({ connectionString: databaseUrl });

let objectKey;
let jobId;

async function jsonRequest(path, init) {
  const response = await fetch(`${apiBase}${path}`, init);
  const payload = await response.json();
  assert.equal(response.ok, true, JSON.stringify(payload));
  return payload;
}

try {
  const health = await jsonRequest("/health");
  assert.equal(health.status, "ok");
  assert.equal(health.conversionEngine, "disabled");

  const file = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );
  const ticket = await jsonRequest("/uploads/presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName: "smoke.png", mimeType: "image/png", size: file.length }),
  });
  objectKey = ticket.objectKey;

  const preflight = await fetch(ticket.uploadUrl, {
    method: "OPTIONS",
    headers: {
      Origin: "http://localhost:3000",
      "Access-Control-Request-Method": "PUT",
      "Access-Control-Request-Headers": "content-type",
    },
  });
  assert.equal(preflight.ok, true, await preflight.text());
  assert.equal(
    preflight.headers.get("access-control-allow-origin"),
    "http://localhost:3000",
  );

  const upload = await fetch(ticket.uploadUrl, {
    method: "PUT",
    headers: ticket.requiredHeaders,
    body: file,
  });
  assert.equal(upload.ok, true, await upload.text());

  const job = await jsonRequest("/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      objectKey,
      fileName: "smoke.png",
      mimeType: "image/png",
      size: file.length,
      sourceFormat: "PNG",
      targetFormat: "WebP",
      quality: 86,
      scale: 1,
    }),
  });
  jobId = job.id;
  assert.equal(job.status, "queued");

  const fetchedJob = await jsonRequest(`/jobs/${jobId}`);
  assert.equal(fetchedJob.id, jobId);
  assert.equal(fetchedJob.status, "queued");

  const stored = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: objectKey }));
  assert.equal(stored.ContentLength, file.length);

  const persisted = await pool.query("select status from jobs where id = $1", [jobId]);
  assert.equal(persisted.rows[0]?.status, "queued");

  const queuedJob = await queue.getJob(jobId);
  assert.ok(queuedJob);
  assert.equal(await queuedJob.getState(), "waiting");

  console.log("Integration smoke test passed");
} finally {
  if (jobId) {
    const queuedJob = await queue.getJob(jobId);
    await queuedJob?.remove();
    await pool.query("delete from jobs where id = $1", [jobId]);
  }
  if (objectKey) {
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: objectKey }));
  }
  await Promise.all([queue.close(), pool.end()]);
}
