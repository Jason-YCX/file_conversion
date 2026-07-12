# 轻转

面向普通用户的在线文件转换工具站。第一阶段聚焦图片任务，采用 Next.js 前端、NestJS API、PostgreSQL、Redis/BullMQ 和 S3 兼容对象存储，为后续图片、音频、视频和文档转换 Worker 预留稳定接口。

## 当前能力

- 方案 2 的暖白 / 紫色响应式首页
- 图片拖放与多文件队列
- 源格式识别与输出格式选择
- MinIO/R2 兼容的浏览器直传
- PostgreSQL 持久化任务和 BullMQ 转换队列
- NestJS 健康检查、签名上传、创建任务和任务查询 API
- 画质、尺寸、搜索与常用转换交互状态
- 桌面端与移动端适配
- Open Graph 分享预览图

当前版本不包含转换 Worker。文件会真实上传，任务会持久化并进入 `conversion` 队列，页面随后提示“转换引擎暂未启用”。

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
npm run infra:down
```

环境变量模板位于根目录和 `apps/api/.env.example`。默认值可直接匹配 `compose.yaml`，一般无需创建本地环境文件。

## API

- `GET /api/v1/health`：检查 PostgreSQL、Redis 和对象存储
- `POST /api/v1/uploads/presign`：生成文件直传地址
- `POST /api/v1/jobs`：校验已上传对象并创建排队任务
- `GET /api/v1/jobs/:id`：查询持久化任务状态

默认只接受图片，单文件上限 50MB，前端一次最多添加10个文件并以最多3路并发上传。

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
