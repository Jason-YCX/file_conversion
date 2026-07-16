"use client";

import {
  ArrowRight,
  CaretDown,
  CheckCircle,
  DownloadSimple,
  FileImage,
  FileText,
  FileZip,
  ImageSquare,
  MusicNotes,
  RocketLaunch,
  Sparkle,
  SpinnerGap,
  VideoCamera,
  X,
} from "@phosphor-icons/react";
import {
  ChangeEvent,
  DragEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ApiClientError,
  createConversionJob,
  createArchive,
  getArchive,
  getConversionJob,
  requestUploadTicket,
  resolveApiUrl,
  uploadToObjectStorage,
} from "@/lib/api";

type UploadItem = {
  file: File;
  id: string;
  previewUrl: string | null;
  objectKey?: string;
  jobId?: string;
  progress: number;
  state: "idle" | "uploading" | "queued" | "processing" | "completed" | "error";
  error?: string;
  downloadUrl?: string;
};

type ConversionStatus = "idle" | "uploading" | "converting" | "completed" | "error";

const sourceFormats = ["自动识别", "JPG", "PNG", "WebP", "AVIF", "HEIC", "SVG", "GIF", "TIFF"];
const targetFormats = ["WebP", "JPG", "PNG", "AVIF", "GIF", "TIFF"];
const supportedImageExtensions = /\.(jpe?g|png|webp|avif|heic|heif|svg|gif|tiff?)$/i;
const supportedImageMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/heic",
  "image/heif",
  "image/svg+xml",
  "image/gif",
  "image/tiff",
]);
const imageInputAccept = ".jpg,.jpeg,.png,.webp,.avif,.heic,.heif,.svg,.gif,.tif,.tiff";

const popularConversions = [
  { from: "HEIC", to: "JPG", tone: "coral" },
  { from: "PNG", to: "WebP", tone: "violet" },
  { from: "WebP", to: "PNG", tone: "coral" },
  { from: "AVIF", to: "JPG", tone: "violet" },
  { from: "SVG", to: "PNG", tone: "coral" },
  { from: "图片", to: "PDF", tone: "violet" },
];

const toolCategories = [
  {
    title: "图片",
    description: "支持多种格式转换、编辑和优化处理",
    icon: ImageSquare,
    active: true,
  },
  {
    title: "音频",
    description: "音频格式转换、剪辑与音质调整",
    icon: MusicNotes,
  },
  {
    title: "视频",
    description: "视频格式转换、压缩与画面处理",
    icon: VideoCamera,
  },
  {
    title: "文档",
    description: "文档格式转换、合并与内容提取",
    icon: FileText,
  },
];

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function imageMimeType(file: File) {
  if (supportedImageMimeTypes.has(file.type.toLowerCase())) return file.type;
  const extension = file.name.split(".").pop()?.toLowerCase();
  const types: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    avif: "image/avif",
    heic: "image/heic",
    heif: "image/heif",
    svg: "image/svg+xml",
    gif: "image/gif",
    tif: "image/tiff",
    tiff: "image/tiff",
  };
  return types[extension ?? ""] ?? "application/octet-stream";
}

async function mapWithConcurrency<T, R>(
  values: T[],
  limit: number,
  worker: (value: T) => Promise<R>,
) {
  const results = new Array<R>(values.length);
  let nextIndex = 0;

  async function run() {
    while (nextIndex < values.length) {
      const index = nextIndex++;
      results[index] = await worker(values[index]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, values.length) }, () => run()),
  );
  return results;
}

function delay(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function PixelCursor() {
  const dotRef = useRef<HTMLDivElement>(null);
  const haloRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = document.documentElement;
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let cursorEnabled = false;

    const hideCursorEffect = () => {
      dotRef.current?.classList.remove("is-visible");
      haloRef.current?.classList.remove("is-visible", "is-active");
    };
    const syncCursorMode = () => {
      cursorEnabled = finePointer.matches && !reducedMotion.matches;
      root.classList.toggle("pixel-cursor-enabled", cursorEnabled);
      if (!cursorEnabled) hideCursorEffect();
    };
    const syncInteractiveState = (target: EventTarget | null) => {
      if (!cursorEnabled) return;
      const interactive = target instanceof Element
        ? target.closest("a, button, select, input, .drop-zone")
        : null;
      haloRef.current?.classList.toggle("is-active", Boolean(interactive));
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!cursorEnabled) return;
      const transform = `translate3d(${event.clientX}px, ${event.clientY}px, 0)`;
      if (dotRef.current) dotRef.current.style.transform = transform;
      if (haloRef.current) haloRef.current.style.transform = transform;
      dotRef.current?.classList.add("is-visible");
      haloRef.current?.classList.add("is-visible");
      syncInteractiveState(event.target);
    };
    const handlePointerOver = (event: PointerEvent) => {
      syncInteractiveState(event.target);
    };

    syncCursorMode();
    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    document.addEventListener("pointerover", handlePointerOver, { passive: true });
    root.addEventListener("mouseleave", hideCursorEffect);
    finePointer.addEventListener("change", syncCursorMode);
    reducedMotion.addEventListener("change", syncCursorMode);

    return () => {
      root.classList.remove("pixel-cursor-enabled");
      window.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerover", handlePointerOver);
      root.removeEventListener("mouseleave", hideCursorEffect);
      finePointer.removeEventListener("change", syncCursorMode);
      reducedMotion.removeEventListener("change", syncCursorMode);
    };
  }, []);

  return (
    <div className="pixel-cursor" aria-hidden="true">
      <div className="pixel-cursor-dot" ref={dotRef} />
      <div className="pixel-cursor-halo" ref={haloRef} />
    </div>
  );
}

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [sourceFormat, setSourceFormat] = useState("自动识别");
  const [targetFormat, setTargetFormat] = useState("WebP");
  const [items, setItems] = useState<UploadItem[]>([]);
  const [status, setStatus] = useState<ConversionStatus>("idle");
  const [queuedCount, setQueuedCount] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [qualityOpen, setQualityOpen] = useState(false);
  const [sizeOpen, setSizeOpen] = useState(false);
  const [allFormatsOpen, setAllFormatsOpen] = useState(false);
  const [quality, setQuality] = useState(86);
  const [scale, setScale] = useState(1);
  const [toast, setToast] = useState("");
  const [celebrating, setCelebrating] = useState(false);
  const [archiveState, setArchiveState] = useState<"idle" | "creating" | "ready" | "error">("idle");
  const [archiveDownloadUrl, setArchiveDownloadUrl] = useState("");
  const previousStatusRef = useRef<ConversionStatus>("idle");

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const previousStatus = previousStatusRef.current;
    previousStatusRef.current = status;
    if (previousStatus === "completed" || status !== "completed") return;
    setCelebrating(true);
    const timer = window.setTimeout(() => setCelebrating(false), 900);
    return () => window.clearTimeout(timer);
  }, [status]);

  const totalSize = useMemo(
    () => items.reduce((total, item) => total + item.file.size, 0),
    [items],
  );
  const uploadProgress = useMemo(() => {
    if (!items.length) return 0;
    return Math.round(
      items.reduce((total, item) => total + item.progress, 0) / items.length,
    );
  }, [items]);
  const completedItems = useMemo(
    () => items.filter((item) => item.state === "completed" && item.jobId),
    [items],
  );

  const resetQueuedState = () => {
    setItems((current) =>
      current.map((item) => ({
        ...item,
        jobId: undefined,
        progress: 0,
        state: "idle",
        error: undefined,
        downloadUrl: undefined,
      })),
    );
    setQueuedCount(0);
    setStatus("idle");
    setArchiveState("idle");
    setArchiveDownloadUrl("");
  };

  const updateItem = (id: string, patch: Partial<UploadItem>) => {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  };

  const addFiles = (files: FileList | File[]) => {
    if (status === "uploading" || status === "converting") {
      setToast("请等待当前上传完成");
      return;
    }
    const accepted = Array.from(files).filter((file) => {
      return supportedImageMimeTypes.has(file.type.toLowerCase()) || supportedImageExtensions.test(file.name);
    });

    if (!accepted.length) {
      setToast("请选择图片文件");
      return;
    }

    const availableSlots = Math.max(0, 10 - items.length);
    const additions = accepted.slice(0, availableSlots);
    if (!additions.length) {
      setToast("一次最多处理 10 个文件");
      return;
    }
    if (accepted.length > additions.length) {
      setToast("一次最多处理 10 个文件，超出的文件未添加");
    }

    setItems((current) => [
      ...current,
      ...additions.map((file, index) => ({
        file,
        id: `${file.name}-${file.lastModified}-${index}-${crypto.randomUUID()}`,
        previewUrl:
          file.type.startsWith("image/") && !/\.(heic|heif)$/i.test(file.name)
            ? URL.createObjectURL(file)
            : null,
        progress: 0,
        state: "idle" as const,
      })),
    ]);
    setStatus("idle");
    setQueuedCount(0);
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) addFiles(event.target.files);
    event.target.value = "";
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    addFiles(event.dataTransfer.files);
  };

  const removeItem = (id: string) => {
    const target = items.find((item) => item.id === id);
    if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
    const remaining = items.filter((item) => item.id !== id);
    const remainingQueued = remaining.filter((item) => item.jobId).length;
    setItems(remaining);
    setQueuedCount(remainingQueued);
    setStatus(
      remaining.length > 0 && remaining.every((item) => item.state === "completed")
        ? "completed"
        : "idle",
    );
    setArchiveState("idle");
    setArchiveDownloadUrl("");
  };

  const pollConversion = async (itemId: string, jobId: string) => {
    let requestFailures = 0;
    while (true) {
      await delay(1200);
      try {
        const job = await getConversionJob(jobId);
        requestFailures = 0;
        if (job.status === "queued") {
          updateItem(itemId, { state: "queued" });
          continue;
        }
        if (job.status === "processing") {
          updateItem(itemId, { state: "processing" });
          continue;
        }
        if (job.status === "completed" && job.output) {
          updateItem(itemId, {
            state: "completed",
            downloadUrl: resolveApiUrl(job.output.downloadUrl),
          });
          return true;
        }
        updateItem(itemId, {
          state: "error",
          jobId: undefined,
          error: job.errorMessage ?? "转换失败，请重试",
        });
        return false;
      } catch (error) {
        requestFailures += 1;
        if (requestFailures < 4) continue;
        updateItem(itemId, {
          state: "error",
          jobId: undefined,
          error: error instanceof ApiClientError ? error.message : "查询转换状态失败",
        });
        return false;
      }
    }
  };

  const startConversion = async () => {
    if (!items.length) {
      inputRef.current?.click();
      return;
    }

    const pendingItems = items.filter((item) => !item.jobId);
    if (!pendingItems.length) return;

    setStatus("uploading");
    const outcomes = await mapWithConcurrency(pendingItems, 3, async (item) => {
      updateItem(item.id, { state: "uploading", error: undefined });
      try {
        const mimeType = imageMimeType(item.file);
        let objectKey = item.objectKey;
        if (!objectKey) {
          const ticket = await requestUploadTicket({
            fileName: item.file.name,
            mimeType,
            size: item.file.size,
          });
          await uploadToObjectStorage(ticket, item.file, (progress) => {
            updateItem(item.id, { progress });
          });
          objectKey = ticket.objectKey;
          updateItem(item.id, { objectKey });
        }

        const job = await createConversionJob({
          objectKey,
          fileName: item.file.name,
          mimeType,
          size: item.file.size,
          sourceFormat,
          targetFormat,
          quality,
          scale,
        });
        updateItem(item.id, {
          jobId: job.id,
          progress: 100,
          state: "queued",
        });
        return { itemId: item.id, jobId: job.id };
      } catch (error) {
        const message =
          error instanceof ApiClientError ? error.message : "任务创建失败，请重试";
        updateItem(item.id, { state: "error", error: message });
        return null;
      }
    });

    const totalQueued =
      items.filter((item) => Boolean(item.jobId)).length +
      outcomes.filter(Boolean).length;
    setQueuedCount(totalQueued);
    const queuedJobs = outcomes.filter(
      (outcome): outcome is { itemId: string; jobId: string } => Boolean(outcome),
    );
    if (!queuedJobs.length) {
      setStatus("error");
      setToast("没有任务成功进入转换队列");
      return;
    }
    setStatus("converting");
    setToast(
      totalQueued === items.length
        ? "文件已上传，正在转换"
        : `${totalQueued} 个任务正在转换，其余文件可重试`,
    );
    const completed = await Promise.all(
      queuedJobs.map((job) => pollConversion(job.itemId, job.jobId)),
    );
    if (completed.every(Boolean) && totalQueued === items.length) {
      setStatus("completed");
      setToast("全部文件转换完成");
    } else {
      setStatus("error");
      setToast("部分文件转换失败，可移除失败项后继续下载");
    }
  };

  const startArchiveDownload = async () => {
    const jobIds = completedItems.flatMap((item) => (item.jobId ? [item.jobId] : []));
    if (!jobIds.length) return;
    setArchiveState("creating");
    try {
      let archive = await createArchive(jobIds);
      while (archive.status === "queued" || archive.status === "processing") {
        await delay(1200);
        archive = await getArchive(archive.id);
      }
      if (archive.status !== "completed" || !archive.output) {
        throw new ApiClientError(archive.errorMessage ?? "压缩包生成失败");
      }
      const downloadUrl = resolveApiUrl(archive.output.downloadUrl);
      setArchiveDownloadUrl(downloadUrl);
      setArchiveState("ready");
      window.location.assign(downloadUrl);
    } catch (error) {
      setArchiveState("error");
      setToast(error instanceof ApiClientError ? error.message : "压缩包生成失败");
    }
  };

  const choosePopular = (from: string, to: string) => {
    setSourceFormat(from === "图片" ? "自动识别" : from);
    setTargetFormat(to === "PDF" ? "JPG" : to);
    resetQueuedState();
    document.getElementById("converter")?.scrollIntoView({ behavior: "smooth" });
    if (to === "PDF") setToast("图片转 PDF 将在文档工具中提供");
  };

  const buttonLabel =
    status === "uploading"
      ? `正在上传 ${uploadProgress}%`
      : status === "converting"
        ? "正在转换"
        : status === "completed"
          ? "转换完成"
        : items.length
          ? `转换 ${items.filter((item) => !item.jobId).length || items.length} 个文件`
          : "开始转换";

  return (
    <main className={`site-shell status-${status}`}>
      <PixelCursor />
      <header className="site-header">
        <a className="brand" href="#top" aria-label="轻转首页">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/qingzhuan-logo.png" alt="轻转" />
        </a>
      </header>

      <section className="hero" id="top">
        {/* Generated pixel-art assets are decorative and intentionally bypass the vinext image proxy. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="pixel-star-field" src="/pixel/pixel-stars.png" alt="" aria-hidden="true" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="pixel-horizon" src="/pixel/pixel-horizon.png" alt="" aria-hidden="true" />
        {celebrating && (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="completion-burst" src="/pixel/pixel-stars.png" alt="" aria-hidden="true" />
        )}
        <div className="hero-inner">
          <div className="hero-copy">
            <h1>想把图片转成什么？</h1>
            <p className="hero-subtitle">选择格式、上传图片，剩下的交给轻转。</p>
            <div className="hero-links" aria-label="快捷设置">
              <button type="button" onClick={() => inputRef.current?.click()}>
                批量转换 <ArrowRight size={15} weight="bold" />
              </button>
              <button type="button" onClick={() => setQualityOpen((open) => !open)}>
                画质设置 <ArrowRight size={15} weight="bold" />
              </button>
              <button type="button" onClick={() => setSizeOpen((open) => !open)}>
                尺寸调整 <ArrowRight size={15} weight="bold" />
              </button>
            </div>
            <div className="format-orbit" aria-hidden="true">
              <span className="format-chip chip-jpg">JPG</span>
              <span className="format-chip chip-png">PNG</span>
              <span className="format-chip chip-webp">WebP</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="pixel-rocket" src="/pixel/pixel-rocket.png" alt="" />
            </div>
          </div>

          <div className="converter" id="converter">
            <div className="format-row">
              <label className="select-wrap">
                <span className="sr-only">源格式</span>
                <select
                  value={sourceFormat}
                  onChange={(event) => {
                    setSourceFormat(event.target.value);
                    resetQueuedState();
                  }}
                >
                  {sourceFormats.map((format) => (
                    <option key={format}>{format}</option>
                  ))}
                </select>
                <CaretDown size={16} weight="bold" aria-hidden="true" />
              </label>
              <span className="format-word">转为</span>
              <label className="select-wrap">
                <span className="sr-only">输出格式</span>
                <select
                  value={targetFormat}
                  onChange={(event) => {
                    setTargetFormat(event.target.value);
                    resetQueuedState();
                  }}
                >
                  {targetFormats.map((format) => (
                    <option key={format}>{format}</option>
                  ))}
                </select>
                <CaretDown size={16} weight="bold" aria-hidden="true" />
              </label>
            </div>

            <div
              className={`drop-zone ${isDragging ? "is-dragging" : ""} ${items.length ? "has-files" : ""}`}
              data-status={status}
              onDragEnter={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
            >
              {!items.length ? (
                <>
                  <div className="upload-mascot" aria-hidden="true">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/pixel/pixel-ufo.png" alt="" />
                  </div>
                  <button className="upload-button" type="button" onClick={() => inputRef.current?.click()}>
                    上传图片
                  </button>
                  <p>也可以拖放多个文件</p>
                  <span>支持 JPG、PNG、WebP、AVIF、HEIC 等常见格式 · 文件仅保存 2 小时</span>
                </>
              ) : (
                <div className="file-queue" aria-live="polite">
                  <div className="queue-heading">
                    <div>
                      <strong>{items.length} 个图片已添加</strong>
                      <span>{formatBytes(totalSize)}</span>
                      <span>文件将在上传 2 小时后自动删除</span>
                    </div>
                    <button
                      type="button"
                      disabled={status === "uploading" || status === "converting"}
                      onClick={() => inputRef.current?.click()}
                    >
                      继续添加
                    </button>
                  </div>
                  <div
                    className="queue-list"
                    role="list"
                    aria-label="已上传图片列表"
                    tabIndex={items.length > 3 ? 0 : undefined}
                  >
                    {items.map((item) => (
                      <div className="queue-item" key={item.id} role="listitem">
                        <div className="file-thumb">
                          {item.previewUrl ? (
                            // Blob URLs are created locally after the user selects a file, so next/image cannot optimize them.
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={item.previewUrl} alt="" />
                          ) : (
                            <FileImage size={25} aria-hidden="true" />
                          )}
                        </div>
                        <div className="file-copy">
                          <strong>{item.file.name}</strong>
                          <span>
                            {formatBytes(item.file.size)}
                            {item.state === "uploading" && ` · 上传 ${item.progress}%`}
                            {item.state === "queued" && " · 已排队"}
                            {item.state === "processing" && " · 转换中"}
                            {item.state === "completed" && " · 转换完成"}
                            {item.state === "error" && ` · ${item.error ?? "失败"}`}
                          </span>
                        </div>
                        {(item.state === "uploading" || item.state === "processing" || item.state === "queued") && (
                          <SpinnerGap className="spinner queue-spinner" size={21} weight="bold" aria-label="正在上传" />
                        )}
                        {item.state === "completed" && item.downloadUrl && (
                          <a className="queue-download" href={item.downloadUrl} aria-label={`下载 ${item.file.name}`}>
                            <DownloadSimple size={20} weight="bold" />
                          </a>
                        )}
                        {item.state === "error" && <span className="queue-error" aria-label="任务失败">!</span>}
                        <button
                          className="remove-file"
                          type="button"
                          disabled={status === "uploading" || status === "converting"}
                          onClick={() => removeItem(item.id)}
                          aria-label={`移除 ${item.file.name}`}
                        >
                          <X size={18} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="pixel-hud" aria-hidden="true">
                <strong>{status === "idle" ? "READY..." : status === "completed" ? "DONE!" : "WORKING..."}</strong>
                <span className="hud-lives">◆ ◆ ◆</span>
                <span className="hud-meter" />
              </div>
            </div>

            {(qualityOpen || sizeOpen) && (
              <div className="quick-settings">
                {qualityOpen && (
                  <label>
                    <span>输出画质 <strong>{quality}%</strong></span>
                    <input
                      type="range"
                      min="40"
                      max="100"
                      value={quality}
                      onChange={(event) => {
                        setQuality(Number(event.target.value));
                        resetQueuedState();
                      }}
                    />
                  </label>
                )}
                {sizeOpen && (
                  <label>
                    <span>图片尺寸</span>
                    <select
                      value={scale}
                      onChange={(event) => {
                        setScale(Number(event.target.value));
                        resetQueuedState();
                      }}
                    >
                      <option value={1}>保持原尺寸</option>
                      <option value={0.75}>缩放至 75%</option>
                      <option value={0.5}>缩放至 50%</option>
                    </select>
                  </label>
                )}
              </div>
            )}

            {allFormatsOpen && (
              <div className="all-formats" aria-label="全部图片格式">
                {targetFormats.map((format) => (
                  <button
                    type="button"
                    key={format}
                    className={targetFormat === format ? "active" : ""}
                    onClick={() => {
                      setTargetFormat(format);
                      resetQueuedState();
                    }}
                  >
                    {format}
                  </button>
                ))}
              </div>
            )}

            <div className="converter-actions">
              <button className="all-formats-button" type="button" onClick={() => setAllFormatsOpen((open) => !open)}>
                查看全部图片格式 <ArrowRight size={16} weight="bold" />
              </button>
              <button
                className={`convert-button ${status === "completed" ? "is-done" : ""}`}
                type="button"
                onClick={startConversion}
                disabled={status === "uploading" || status === "converting" || status === "completed"}
              >
                {status === "uploading" || status === "converting" ? (
                  <SpinnerGap className="spinner" size={22} weight="bold" />
                ) : status === "completed" ? (
                  <CheckCircle size={21} weight="fill" />
                ) : null}
                {buttonLabel}
              </button>
            </div>
            {completedItems.length >= 2 && (
              <div className="archive-actions">
                <button
                  type="button"
                  className="archive-button"
                  disabled={archiveState === "creating"}
                  onClick={archiveState === "ready" && archiveDownloadUrl
                    ? () => window.location.assign(archiveDownloadUrl)
                    : startArchiveDownload}
                >
                  {archiveState === "creating" ? (
                    <SpinnerGap className="spinner" size={19} weight="bold" />
                  ) : (
                    <FileZip size={19} weight="bold" />
                  )}
                  {archiveState === "creating"
                    ? "正在打包"
                    : archiveState === "ready"
                      ? "重新下载压缩包"
                      : `打包下载 ${completedItems.length} 个文件`}
                </button>
              </div>
            )}
            {status === "uploading" && (
              <div
                className="upload-progress"
                role="progressbar"
                aria-label="文件上传进度"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={uploadProgress}
              >
                <span style={{ width: `${uploadProgress}%` }} />
              </div>
            )}
            {status === "converting" && (
              <p className="conversion-message" role="status">
                <SpinnerGap className="spinner" size={18} weight="bold" /> {queuedCount} 个任务正在转换
              </p>
            )}
            {status === "completed" && (
              <p className="conversion-message" role="status">
                <CheckCircle size={18} weight="fill" /> {completedItems.length} 个文件转换完成，请在 2 小时内下载
              </p>
            )}
            {status === "error" && <p className="conversion-message is-error">部分文件未成功排队，请重试失败项</p>}
          </div>
        </div>
      </section>

      <section className="popular-section" aria-labelledby="popular-title">
        <div className="section-inner">
          <h2 id="popular-title"><RocketLaunch size={24} weight="fill" aria-hidden="true" />大家常用</h2>
          <div className="popular-grid">
            {popularConversions.map((item) => (
              <button key={`${item.from}-${item.to}`} type="button" onClick={() => choosePopular(item.from, item.to)}>
                <FileImage className={item.tone} size={24} weight="regular" />
                <span>{item.from} 转 {item.to}</span>
                <ArrowRight className="pill-arrow" size={15} weight="bold" />
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="tools-section" id="tools" aria-labelledby="tools-title">
        <div className="section-inner">
          <div className="section-heading-row">
            <h2 id="tools-title"><Sparkle size={22} weight="fill" aria-hidden="true" />更多文件工具</h2>
            <button type="button" onClick={() => setToast("更多工具正在整理中")}>查看全部 <ArrowRight size={15} /></button>
          </div>
          <div className="tools-strip">
            {toolCategories.map(({ title, description, icon: Icon, active }) => (
              <button
                className={`tool-category ${active ? "active" : ""}`}
                key={title}
                type="button"
                onClick={() => {
                  if (!active) setToast(`${title}转换将在下一阶段开放`);
                }}
              >
                <Icon size={45} weight="regular" />
                <span>
                  <strong>{title}</strong>
                  <small>{description}</small>
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <footer className="site-footer">
        <a className="footer-brand" href="#top" aria-label="返回轻转首页顶部">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/qingzhuan-logo.png" alt="轻转" />
        </a>
      </footer>

      <input ref={inputRef} className="visually-hidden-input" type="file" accept={imageInputAccept} multiple disabled={status === "uploading" || status === "converting"} onChange={handleFileChange} />
      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );
}
