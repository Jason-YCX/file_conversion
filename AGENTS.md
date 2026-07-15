# 轻转项目协作说明

## 项目定位

- 这是一个综合工具站，文件转换只是首个模块。
- 当前优先做好图片转换，再扩展音频、视频、文档及其他工具。

## 当前状态

- 已完成：浏览器签名直传、MinIO存储、PostgreSQL任务记录、BullMQ排队、独立图片转换 Worker 和 ZIP 打包 Worker。
- 前端采用复古像素宇宙视觉，动效直接映射现有上传和转换状态，触屏及减少动态效果模式自动降级。
- 已补齐单服务器生产部署：Caddy、Web、API、Worker、PostgreSQL、Redis和MinIO由独立生产Compose统一编排。
- 生产HTTPS使用三套腾讯云手动证书；部署前校验证书，替换后通过Caddy热重载生效。
- 生产镜像构建通过可配置的 `FFMPEG_BINARIES_URL` 下载FFmpeg二进制，默认使用国内npmmirror地址，避免GitHub Releases不可达导致 `npm ci` 卡住。
- 当前链路是 `上传 -> 对象存储 -> 数据库任务 -> conversion 队列 -> 转换 Worker -> 结果存储 -> 下载`。
- 转换状态包含 `queued / processing / completed / failed / cancelled`，只有 `completed` 才能下载。

## 架构边界

- 根目录是 Next.js/Vinext 前端，保持现有Sites兼容结构。
- `apps/api` 是 NestJS API，负责校验、签名、任务和队列编排。
- 文件字节存对象存储，任务元数据存PostgreSQL，Redis只承载BullMQ队列。
- 图片、音视频、文档等CPU密集转换必须由独立 Worker 消费 `conversion` 队列。
- 不要在 Next.js 或 NestJS 请求进程内执行长时间转换。
- 未经明确要求，不要用D1替换PostgreSQL，也不要把业务存储耦合到前端Sites Worker。
- 生产环境只由Caddy暴露80/443；MinIO内部读写使用 `S3_ENDPOINT`，浏览器签名地址使用 `S3_PUBLIC_ENDPOINT`。

## 开发约束

- 保持现有签名直传流程和统一错误结构 `{ error: { code, message, details? } }`。
- 修改环境变量时同步根目录或 `apps/api/.env.example`。
- 修改数据库结构时同步Drizzle schema并提交生成的迁移。
- 修改API时同步DTO、Swagger描述和相关测试。
- 图片转换输入覆盖 JPG、PNG、WebP、AVIF、HEIC/HEIF、SVG、GIF、TIFF，输出覆盖 WebP、JPG、PNG、AVIF、GIF、TIFF，共 42 条跨格式路径；BMP 不在支持范围内。
- 动态 GIF/WebP/TIFF 仅在输出 GIF/WebP/AVIF 时保留动画；转 JPG/PNG/TIFF 时取首帧。
- 批量下载由后端 `archive` 队列流式生成 ZIP，不在浏览器内压缩大文件。
- `uploads/`、`converted/`、`archives/` 下的文件统一只保留2小时；Worker 启动时及每10分钟清理，过期任务标记为 `expired`。
- 基础设施连接异常时，先启动Compose，再检查 `/api/v1/health`，不要直接改业务代码规避。

## 常用命令

- 完整本地环境：`npm run dev:full`
- 单独运行转换 Worker：`npm run dev:worker`
- 首次生产部署：`SKIP_GIT_PULL=1 npm run deploy:prod`
- 后续生产更新：`npm run deploy:prod`
- 生产证书校验/重载：`npm run certs:check` / `npm run certs:reload`
- 生产配置、备份、恢复和回滚：读取 `docs/deployment.md`。
- 修改完成后不要主动启动项目；默认复用用户已经启动的服务，启动动作交给用户执行。
- Worker 开发模式必须通过 Nest CLI 的监听编译启动；不要使用缺少装饰器元数据的 `tsx watch src/worker.ts`。
- 静态检查：`npm run lint`
- 测试：`npm test`

## 按需阅读

- 本地运行、端口、接口和当前能力：读取 `README.md`。
- 只有修改后端接口时，才查看本地Swagger及 `apps/api/src` 对应模块。

## 对话约束

每次对话中，如果有功能更新、逻辑优化、性能升级的需要及时更新到当前文档中，确保能从当前文档了解到整个项目的架构、逻辑；

对项目的修改不要自由发挥，不要执行超出对话的操作。

每次回复都叫我"老大"
