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
const archiveQueue = new Queue("archive", {
  connection: {
    host: redisUrl.hostname,
    port: Number(redisUrl.port || 6379),
    db: Number(redisUrl.pathname.slice(1) || 0),
  },
});
const pool = new pg.Pool({ connectionString: databaseUrl });

let objectKey;
const jobIds = [];
const outputObjectKeys = [];
let archiveId;
let archiveObjectKey;

async function jsonRequest(path, init) {
  const response = await fetch(`${apiBase}${path}`, init);
  const payload = await response.json();
  assert.equal(response.ok, true, JSON.stringify(payload));
  return payload;
}

async function waitFor(path, expectedStatus, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const task = await jsonRequest(path);
    if (task.status === expectedStatus) return task;
    assert.notEqual(task.status, "failed", JSON.stringify(task));
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${path} to reach ${expectedStatus}`);
}

try {
  const health = await jsonRequest("/health");
  assert.equal(health.status, "ok");
  assert.equal(health.conversionEngine, "enabled");

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

  for (const targetFormat of ["WebP", "JPG"]) {
    const job = await jsonRequest("/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        objectKey,
        fileName: "smoke.png",
        mimeType: "image/png",
        size: file.length,
        sourceFormat: "PNG",
        targetFormat,
        quality: 86,
        scale: 1,
      }),
    });
    jobIds.push(job.id);
    assert.equal(job.status, "queued");
  }

  const completedJobs = [];
  for (const id of jobIds) {
    const completed = await waitFor(`/jobs/${id}`, "completed");
    completedJobs.push(completed);
    outputObjectKeys.push(completed.outputObjectKey);
    assert.equal(completed.detectedSourceFormat, "PNG");
    assert.ok(completed.output?.downloadUrl);
  }
  const convertedDownload = await fetch(`${apiBase}/jobs/${jobIds[0]}/download`);
  assert.equal(convertedDownload.ok, true);
  const convertedBytes = Buffer.from(await convertedDownload.arrayBuffer());
  assert.equal(convertedBytes.subarray(0, 4).toString("hex"), "52494646");

  const archive = await jsonRequest("/archives", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jobIds }),
  });
  archiveId = archive.id;
  const completedArchive = await waitFor(`/archives/${archiveId}`, "completed");
  archiveObjectKey = completedArchive.outputObjectKey;
  const archiveDownload = await fetch(`${apiBase}/archives/${archiveId}/download`);
  assert.equal(archiveDownload.ok, true);
  const archiveBytes = Buffer.from(await archiveDownload.arrayBuffer());
  assert.equal(archiveBytes.subarray(0, 2).toString("ascii"), "PK");

  const stored = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: objectKey }));
  assert.equal(stored.ContentLength, file.length);

  const persisted = await pool.query("select status from jobs where id = any($1::uuid[])", [jobIds]);
  assert.equal(persisted.rows.length, 2);
  assert.ok(persisted.rows.every((row) => row.status === "completed"));

  console.log("Integration smoke test passed");
} finally {
  if (archiveId) {
    await (await archiveQueue.getJob(archiveId))?.remove();
    await pool.query("delete from archives where id = $1", [archiveId]);
  }
  if (jobIds.length) {
    for (const id of jobIds) await (await queue.getJob(id))?.remove();
    await pool.query("delete from jobs where id = any($1::uuid[])", [jobIds]);
  }
  for (const key of outputObjectKeys) {
    if (key) await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  }
  if (archiveObjectKey) {
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: archiveObjectKey }));
  }
  if (objectKey) {
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: objectKey }));
  }
  await Promise.all([queue.close(), archiveQueue.close(), pool.end()]);
}
