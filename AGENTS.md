# 轻转项目协作说明

## 项目定位

- 这是一个综合工具站，文件转换只是首个模块。
- 当前优先做好图片转换，再扩展音频、视频、文档及其他工具。

## 当前状态

- 已完成：浏览器签名直传、MinIO存储、PostgreSQL任务记录、BullMQ排队、独立图片转换 Worker 和 ZIP 打包 Worker。
- 前端采用复古像素宇宙视觉，动效直接映射现有上传和转换状态，触屏及减少动态效果模式自动降级。
- 品牌使用双文件轨道转换像素 Logo；横版透明图用于页头和页脚，独立透明图标用于 favicon 与移动端图标。
- 当前只开放图片转换功能，顶部暂时仅保留品牌标识，导航、搜索和登录入口均隐藏。
- 已补齐单服务器生产部署：宿主机Nginx统一承载现有网站和轻转的公网入口，Web、API、Worker、PostgreSQL、Redis和MinIO由独立生产Compose编排。
- 生产HTTPS使用三套腾讯云手动证书；部署前校验证书，替换后通过宿主机Nginx热重载生效。
- 生产镜像由GitHub Actions构建并以完整Git SHA推送到腾讯云TCR；服务器只拉取镜像，不执行 `npm ci` 或前后端编译。
- 2核4G服务器的生产转换与归档并发默认均为1；部署后只保留当前和上一版应用镜像，回滚缺失镜像时从TCR重新拉取。
- 当前链路是 `上传 -> 对象存储 -> 数据库任务 -> conversion 队列 -> 转换 Worker -> 结果存储 -> 下载`。
- 转换状态包含 `queued / processing / completed / failed / cancelled`，只有 `completed` 才能下载。

## 架构边界

- 根目录是 Next.js/Vinext 前端，生产构建只输出自托管的 `dist/standalone`，由生产Compose和宿主机Nginx承载。
- `apps/api` 是 NestJS API，负责校验、签名、任务和队列编排。
- 文件字节存对象存储，任务元数据存PostgreSQL，Redis只承载BullMQ队列。
- 图片、音视频、文档等CPU密集转换必须由独立 Worker 消费 `conversion` 队列。
- 不要在 Next.js 或 NestJS 请求进程内执行长时间转换。
- 业务存储固定使用PostgreSQL，前端不承担业务存储或后台任务职责。
- 生产环境只由宿主机Nginx暴露80/443；Web、API和MinIO API只绑定127.0.0.1回环端口，MinIO内部读写使用 `S3_ENDPOINT`，浏览器签名地址使用 `S3_PUBLIC_ENDPOINT`。

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
- 生产发布：在GitHub Actions手动运行 `Deploy production`
- 已构建SHA的服务器手动补发：`APP_VERSION=完整Git提交SHA SKIP_GIT_PULL=1 npm run deploy:prod`
- 生产应用镜像清理：`npm run cleanup:prod`
- 安装/更新宿主机Nginx站点：`npm run nginx:install`
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
