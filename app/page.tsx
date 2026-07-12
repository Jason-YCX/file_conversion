"use client";

import {
  ArrowRight,
  CaretDown,
  CheckCircle,
  FileImage,
  FileText,
  ImageSquare,
  MagnifyingGlass,
  MusicNotes,
  SpinnerGap,
  UploadSimple,
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
  requestUploadTicket,
  uploadToObjectStorage,
} from "@/lib/api";

type UploadItem = {
  file: File;
  id: string;
  previewUrl: string | null;
  objectKey?: string;
  jobId?: string;
  progress: number;
  state: "idle" | "uploading" | "queued" | "error";
  error?: string;
};

type ConversionStatus = "idle" | "uploading" | "queued" | "error";

const sourceFormats = ["自动识别", "JPG", "PNG", "WebP", "AVIF", "HEIC", "SVG"];
const targetFormats = ["WebP", "JPG", "PNG", "AVIF", "GIF", "TIFF"];

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
  if (file.type.startsWith("image/")) return file.type;
  const extension = file.name.split(".").pop()?.toLowerCase();
  const types: Record<string, string> = {
    avif: "image/avif",
    bmp: "image/bmp",
    heic: "image/heic",
    heif: "image/heif",
    svg: "image/svg+xml",
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
  const [searchOpen, setSearchOpen] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

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

  const resetQueuedState = () => {
    setItems((current) =>
      current.map((item) => ({
        ...item,
        jobId: undefined,
        progress: 0,
        state: "idle",
        error: undefined,
      })),
    );
    setQueuedCount(0);
    setStatus("idle");
  };

  const updateItem = (id: string, patch: Partial<UploadItem>) => {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  };

  const addFiles = (files: FileList | File[]) => {
    if (status === "uploading") {
      setToast("请等待当前上传完成");
      return;
    }
    const accepted = Array.from(files).filter((file) => {
      return (
        file.type.startsWith("image/") ||
        /\.(heic|heif|avif|svg|tif|tiff|bmp)$/i.test(file.name)
      );
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
      remaining.length > 0 && remainingQueued === remaining.length
        ? "queued"
        : "idle",
    );
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
        return true;
      } catch (error) {
        const message =
          error instanceof ApiClientError ? error.message : "任务创建失败，请重试";
        updateItem(item.id, { state: "error", error: message });
        return false;
      }
    });

    const totalQueued =
      items.filter((item) => Boolean(item.jobId)).length +
      outcomes.filter(Boolean).length;
    setQueuedCount(totalQueued);
    if (totalQueued === items.length) {
      setStatus("queued");
      setToast("文件已上传，转换任务已进入队列");
    } else {
      setStatus("error");
      setToast(`${totalQueued} 个任务已排队，其余文件可重试`);
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
      : status === "queued"
        ? "已加入转换队列"
        : items.length
          ? `转换 ${items.filter((item) => !item.jobId).length || items.length} 个文件`
          : "开始转换";

  return (
    <main className="site-shell">
      <header className="site-header">
        <a className="brand" href="#top" aria-label="轻转首页">
          轻转
        </a>
        <nav className="main-nav" aria-label="主导航">
          <a href="#converter">
            文件转换 <CaretDown size={15} weight="bold" />
          </a>
          <a href="#tools">
            图片工具 <CaretDown size={15} weight="bold" />
          </a>
          <a href="#tools">
            计算工具 <CaretDown size={15} weight="bold" />
          </a>
          <a href="#tools">
            全部工具 <CaretDown size={15} weight="bold" />
          </a>
        </nav>
        <div className="header-actions">
          <button
            className="icon-button"
            type="button"
            aria-label="搜索工具"
            aria-expanded={searchOpen}
            onClick={() => setSearchOpen((open) => !open)}
          >
            <MagnifyingGlass size={27} weight="bold" />
          </button>
          <button className="login-button" type="button" onClick={() => setToast("登录功能将在正式版接入")}>登录</button>
        </div>
        {searchOpen && (
          <div className="search-popover" role="dialog" aria-label="搜索工具">
            <MagnifyingGlass size={20} />
            <input autoFocus placeholder="搜索图片、音频或计算工具" aria-label="搜索工具" />
            <button type="button" aria-label="关闭搜索" onClick={() => setSearchOpen(false)}>
              <X size={18} />
            </button>
          </div>
        )}
      </header>

      <section className="hero" id="top">
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
            {/* This is a generated static asset; direct rendering avoids the vinext image proxy. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="format-flow-art"
              src="/format-flow-transparent.png"
              alt="JPG、PNG 与 WebP 格式沿着转换路径流动"
            />
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
                  <div className="upload-icon-wrap" aria-hidden="true">
                    <UploadSimple size={46} weight="regular" />
                  </div>
                  <button className="upload-button" type="button" onClick={() => inputRef.current?.click()}>
                    上传图片
                  </button>
                  <p>也可以拖放多个文件</p>
                  <span>支持 JPG、PNG、WebP、AVIF、HEIC 等常见格式</span>
                </>
              ) : (
                <div className="file-queue" aria-live="polite">
                  <div className="queue-heading">
                    <div>
                      <strong>{items.length} 个图片已添加</strong>
                      <span>{formatBytes(totalSize)}</span>
                    </div>
                    <button
                      type="button"
                      disabled={status === "uploading"}
                      onClick={() => inputRef.current?.click()}
                    >
                      继续添加
                    </button>
                  </div>
                  <div className="queue-list">
                    {items.slice(0, 3).map((item) => (
                      <div className="queue-item" key={item.id}>
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
                            {item.state === "error" && ` · ${item.error ?? "失败"}`}
                          </span>
                        </div>
                        {item.state === "uploading" && (
                          <SpinnerGap className="spinner queue-spinner" size={21} weight="bold" aria-label="正在上传" />
                        )}
                        {item.state === "queued" && <CheckCircle className="done-icon" size={22} weight="fill" aria-label="已排队" />}
                        {item.state === "error" && <span className="queue-error" aria-label="任务失败">!</span>}
                        <button
                          className="remove-file"
                          type="button"
                          disabled={status === "uploading"}
                          onClick={() => removeItem(item.id)}
                          aria-label={`移除 ${item.file.name}`}
                        >
                          <X size={18} />
                        </button>
                      </div>
                    ))}
                    {items.length > 3 && <p className="more-files">还有 {items.length - 3} 个文件</p>}
                  </div>
                </div>
              )}
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
                className={`convert-button ${status === "queued" ? "is-done" : ""}`}
                type="button"
                onClick={startConversion}
                disabled={status === "uploading" || status === "queued"}
              >
                {status === "uploading" ? (
                  <SpinnerGap className="spinner" size={22} weight="bold" />
                ) : status === "queued" ? (
                  <CheckCircle size={21} weight="fill" />
                ) : null}
                {buttonLabel}
              </button>
            </div>
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
            {status === "queued" && (
              <p className="conversion-message" role="status">
                <CheckCircle size={18} weight="fill" /> {queuedCount} 个任务已排队，转换引擎暂未启用
              </p>
            )}
            {status === "error" && <p className="conversion-message is-error">部分文件未成功排队，请重试失败项</p>}
          </div>
        </div>
      </section>

      <section className="popular-section" aria-labelledby="popular-title">
        <div className="section-inner">
          <h2 id="popular-title">大家常用</h2>
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
            <h2 id="tools-title">更多文件工具</h2>
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
        <a className="footer-brand" href="#top">轻转</a>
        <p>先把每一次文件转换做得简单，再慢慢装下更多实用工具。</p>
        <div>
          <a href="#converter">文件转换</a>
          <a href="#tools">全部工具</a>
        </div>
      </footer>

      <input ref={inputRef} className="visually-hidden-input" type="file" accept="image/*,.heic,.heif,.avif,.svg,.tif,.tiff,.bmp" multiple disabled={status === "uploading"} onChange={handleFileChange} />
      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );
}
