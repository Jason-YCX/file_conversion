# 轻转

面向普通用户的在线文件转换工具站。第一阶段聚焦图片任务，采用 Next.js 前端、NestJS API、PostgreSQL、Redis/BullMQ 和 S3 兼容对象存储，为后续图片、音频、视频和文档转换 Worker 预留稳定接口。

## 当前能力

- 暖白 / 紫橙的复古像素宇宙响应式首页，包含星球、UFO、火箭轨道与状态彩蛋
- 桌面端保留系统指针并叠加光点跟随与交互吸附，触屏和减少动态效果模式自动关闭
- 图片拖放与多文件队列
- 上传列表超出可视区域后支持内部滚动并完整显示每个文件状态
- 全局操作消息统一显示在页面上方，不遮挡底部操作区域
- 源格式识别与输出格式选择
- MinIO/R2 兼容的浏览器直传
- PostgreSQL 持久化任务、BullMQ 转换/打包队列和独立 Worker
- NestJS 健康检查、签名上传、创建任务、任务查询和下载 API
- 画质、尺寸、搜索与常用转换交互状态
- 桌面端与移动端适配
- JPG、PNG、WebP、AVIF、HEIC/HEIF、SVG、GIF、TIFF 输入
- WebP、JPG、PNG、AVIF、GIF、TIFF 输出及 42 条跨格式路径
- 动态 GIF/WebP/TIFF 转 GIF、WebP、AVIF 时保留动画
- 单文件下载与后端流式 ZIP 批量下载
- 原始上传、转换结果和 ZIP 仅保存2小时，由 Worker 启动时及每10分钟自动清理
- Open Graph 分享预览图

当前链路为 `上传 -> 对象存储 -> PostgreSQL任务 -> BullMQ -> 独立转换Worker -> 对象存储结果 -> 下载`。转换 Worker 与 NestJS 请求进程分开运行。

## 本地运行

要求 Node.js `>=22.13.0`，以及已经启动的 OrbStack（或其他兼容 Docker Compose 的容器运行时）。

```bash
npm install
npm run dev:full
```

本地入口：

- 前端：`http://localhost:3000/`
- API：`http://localhost:4000/api/v1`
- Swagger：`http://localhost:4000/docs`
- MinIO 控制台：`http://localhost:9001/`，开发账号为 `qingzhuan / qingzhuan-secret`

分别运行或停止依赖：

```bash
npm run dev:web
npm run dev:api
npm run dev:worker
npm run infra:down
```

`dev:worker` 使用 NestJS 的 TypeScript 监听编译链路启动，确保依赖注入所需的装饰器元数据完整；不要改用 `tsx watch src/worker.ts` 直接启动 Worker。

环境变量模板位于根目录和 `apps/api/.env.example`。默认值可直接匹配 `compose.yaml`，一般无需创建本地环境文件。

## 生产部署

仓库包含同一台Linux服务器自托管所需的生产文件：

- `Dockerfile.web`：构建Vinext standalone前端镜像
- `Dockerfile.backend`：构建NestJS API和转换Worker共用镜像
- `compose.production.yaml`：从腾讯云TCR拉取应用镜像，并编排Caddy、Web、API、Worker、PostgreSQL、Redis和MinIO
- `Caddyfile`：为前端、API和对象存储域名提供HTTPS与反向代理
- `certs/`：约定三套腾讯云手动证书的目录和固定文件名
- `.env.production.example`：不含真实密钥的生产环境模板
- `scripts/`：部署、镜像清理、证书校验/热重载、健康检查、备份、恢复和应用镜像回滚

生产镜像不再由服务器现场构建。GitHub Actions完成检查后，在GitHub Runner中分别构建Web和Backend镜像，以完整Git提交SHA为版本推送到腾讯云TCR；服务器只拉取对应SHA并启动。构建时 `ffmpeg-static` 使用npmmirror，Docker内的 `npm ci` 关闭audit和fund请求。

首次部署前，将 `.env.production.example` 复制为 `.env.production`，填写域名和随机密钥，登录TCR，并按 `certs/README.md` 放置三套腾讯云证书。生产发布通过GitHub Actions手动运行 `Deploy production`，服务器不会执行依赖安装或项目编译。

GitHub Actions构建成功后的服务器手动补发命令为：

```bash
APP_VERSION=完整Git提交SHA SKIP_GIT_PULL=1 ./scripts/deploy.sh
```

生产环境将MinIO内部读写地址与浏览器签名地址分开；只有Caddy的80/443端口对公网开放，PostgreSQL、Redis、MinIO控制台、Web和API端口均只在Docker网络内使用。完整服务器准备、DNS、GitHub手动发布、备份与回滚说明见 [`docs/deployment.md`](docs/deployment.md)。

## API

- `GET /api/v1/health`：检查 PostgreSQL、Redis 和对象存储
- `POST /api/v1/uploads/presign`：生成文件直传地址
- `POST /api/v1/jobs`：校验已上传对象并创建排队任务
- `GET /api/v1/jobs/:id`：查询持久化任务状态
- `GET /api/v1/jobs/:id/download`：下载已完成的转换结果
- `POST /api/v1/archives`：创建异步 ZIP 打包任务
- `GET /api/v1/archives/:id`：查询打包任务状态
- `GET /api/v1/archives/:id/download`：下载已完成的 ZIP

默认只接受图片，单文件上限 50MB、4000 万像素，前端一次最多添加10个文件并以最多3路并发上传。本地转换并发默认为2，2核4G生产服务器固定从1路起步，单任务超时180秒。

所有对象存储文件统一保留2小时：原始上传位于 `uploads/`，转换结果位于 `converted/`，批量压缩包位于 `archives/`。清理后任务状态变为 `expired`，下载接口返回 `410 FILE_EXPIRED`；数据库任务记录继续保留用于说明过期原因。

PNG/TIFF 保持无损压缩；JPG/WebP/AVIF/GIF 使用画质参数。透明图片转 JPG 时使用白色背景，输出默认纠正 EXIF 方向并移除原始元数据。HEIC 序列取主图；动态图片转 JPG、PNG、TIFF 时取首帧。

## 验证

```bash
npm run lint
npm test
```

完整本地基础设施启动后，还可以运行真实存储、数据库和队列冒烟测试：

```bash
npm run test:integration --workspace @qingzhuan/api
```

设计对照与验收记录见 `design-qa.md`，视觉稿和浏览器截图在 `design/` 目录。
