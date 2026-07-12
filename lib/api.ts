const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api/v1"
).replace(/\/$/, "");

type ErrorEnvelope = {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
};

export type UploadTicket = {
  objectKey: string;
  uploadUrl: string;
  method: "PUT";
  requiredHeaders: Record<string, string>;
  expiresAt: string;
};

export type QueuedJob = {
  id: string;
  status: "queued";
  message: string;
};

export type TaskOutput = {
  fileName: string;
  mimeType: string;
  size: number | null;
  downloadUrl: string;
};

export type ConversionJob = {
  id: string;
  status: "queued" | "processing" | "completed" | "failed" | "cancelled" | "expired";
  detectedSourceFormat?: string | null;
  errorMessage?: string | null;
  output?: TaskOutput;
};

export type ArchiveTask = {
  id: string;
  status: "queued" | "processing" | "completed" | "failed" | "cancelled" | "expired";
  errorMessage?: string | null;
  output?: TaskOutput;
};

export type CreateJobInput = {
  objectKey: string;
  fileName: string;
  mimeType: string;
  size: number;
  sourceFormat: string;
  targetFormat: string;
  quality: number;
  scale: number;
};

export class ApiClientError extends Error {
  constructor(
    message: string,
    readonly code = "API_ERROR",
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

export async function requestUploadTicket(input: {
  fileName: string;
  mimeType: string;
  size: number;
}) {
  return requestJson<UploadTicket>("/uploads/presign", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function uploadToObjectStorage(
  ticket: UploadTicket,
  file: File,
  onProgress: (progress: number) => void,
) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open(ticket.method, ticket.uploadUrl);
    Object.entries(ticket.requiredHeaders).forEach(([name, value]) => {
      request.setRequestHeader(name, value);
    });
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        onProgress(100);
        resolve();
      } else {
        reject(new ApiClientError("文件上传失败，请稍后重试", "UPLOAD_FAILED"));
      }
    };
    request.onerror = () =>
      reject(new ApiClientError("无法连接对象存储", "STORAGE_UNREACHABLE"));
    request.onabort = () =>
      reject(new ApiClientError("文件上传已取消", "UPLOAD_ABORTED"));
    request.send(file);
  });
}

export function createConversionJob(input: CreateJobInput) {
  return requestJson<QueuedJob>("/jobs", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getConversionJob(id: string) {
  return requestJson<ConversionJob>(`/jobs/${id}`);
}

export function createArchive(jobIds: string[]) {
  return requestJson<ArchiveTask>("/archives", {
    method: "POST",
    body: JSON.stringify({ jobIds }),
  });
}

export function getArchive(id: string) {
  return requestJson<ArchiveTask>(`/archives/${id}`);
}

export function resolveApiUrl(path: string) {
  if (/^https?:\/\//i.test(path)) return path;
  const apiOrigin = new URL(API_BASE_URL).origin;
  return new URL(path, apiOrigin).toString();
}

async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init.headers },
    });
  } catch {
    throw new ApiClientError(
      "无法连接后端服务，请确认完整开发环境已经启动",
      "API_UNREACHABLE",
    );
  }

  const payload = (await response.json().catch(() => ({}))) as T & ErrorEnvelope;
  if (!response.ok) {
    throw new ApiClientError(
      payload.error?.message ?? "请求失败，请稍后重试",
      payload.error?.code,
      payload.error?.details,
    );
  }
  return payload;
}
