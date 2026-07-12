# 轻转项目协作说明

## 项目定位

- 这是一个综合工具站，文件转换只是首个模块。
- 当前优先做好图片转换，再扩展音频、视频、文档及其他工具。

## 当前状态

- 已完成：浏览器签名直传、MinIO存储、PostgreSQL任务记录和BullMQ排队。
- 当前链路是 `上传 -> 对象存储 -> 数据库任务 -> conversion 队列`。
- 尚未实现实际转换 Worker；“已排队”不等于“转换完成”，对外说明时必须明确区分。

## 架构边界

- 根目录是 Next.js/Vinext 前端，保持现有Sites兼容结构。
- `apps/api` 是 NestJS API，负责校验、签名、任务和队列编排。
- 文件字节存对象存储，任务元数据存PostgreSQL，Redis只承载BullMQ队列。
- 图片、音视频、文档等CPU密集转换必须由独立 Worker 消费 `conversion` 队列。
- 不要在 Next.js 或 NestJS 请求进程内执行长时间转换。
- 未经明确要求，不要用D1替换PostgreSQL，也不要把业务存储耦合到前端Sites Worker。

## 开发约束

- 保持现有签名直传流程和统一错误结构 `{ error: { code, message, details? } }`。
- 修改环境变量时同步根目录或 `apps/api/.env.example`。
- 修改数据库结构时同步Drizzle schema并提交生成的迁移。
- 修改API时同步DTO、Swagger描述和相关测试。
- 基础设施连接异常时，先启动Compose，再检查 `/api/v1/health`，不要直接改业务代码规避。

## 常用命令

- 完整本地环境：`npm run dev:full`
- 静态检查：`npm run lint`
- 测试：`npm test`

## 按需阅读

- 本地运行、端口、接口和当前能力：读取 `README.md`。
- 只有修改后端接口时，才查看本地Swagger及 `apps/api/src` 对应模块。
