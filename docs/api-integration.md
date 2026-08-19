# 轻转 API 服务对接文档

本文档面向需要通过后端服务调用轻转图片格式转换或原格式压缩能力的开发者。接口采用 HTTP + JSON，文件字节通过对象存储临时签名地址直传，不经过业务 API 进程。

## 1. 接口地址

| 环境 | API Base URL | Swagger |
| --- | --- | --- |
| 本地开发 | `http://localhost:4000/api/v1` | `http://localhost:4000/docs` |
| 生产配置 | `https://qingzhuan-api.jason-ycx.top/api/v1` | `https://qingzhuan-api.jason-ycx.top/docs` |

OpenAPI JSON 默认位于 Swagger 地址对应的 `/docs-json`。

除上传文件字节和下载文件外，请求及响应均使用：

```http
Content-Type: application/json
```

## 2. 鉴权和安全边界

当前 API **没有启用 API Key、OAuth 或请求签名鉴权**。CORS 只约束浏览器，不能限制其他后端服务调用。

- 受信任的内部服务可以直接按本文档调用。
- 如果要开放给外部第三方，建议先在 API 网关或 NestJS API 中增加身份认证、调用配额和审计日志。
- 不要向调用方提供 MinIO/S3 的 Access Key 和 Secret Key。文件上传、下载只使用接口返回的临时签名地址。
- 上传和下载签名地址默认 15 分钟有效，不应长期保存或转发。

## 3. 完整调用流程

```text
调用方服务
  │
  ├─ 1. POST /uploads/presign       申请临时上传地址
  │        ↓
  ├─ 2. PUT {uploadUrl}             直接上传文件字节
  │        ↓
  ├─ 3. POST /jobs                  创建转换或压缩任务
  │        ↓
  ├─ 4. GET /jobs/{id}              查询到最终状态
  │        ↓
  └─ 5. GET /jobs/{id}/download     302 跳转并下载结果

批量下载：所有图片处理任务 completed 后，再创建并查询 /archives 任务。
```

必须等第 2 步上传成功后再创建任务。创建任务时，`objectKey`、`mimeType` 和 `size` 必须与已上传对象完全一致。

## 4. 统一错误结构

所有业务错误都使用以下结构：

```json
{
  "error": {
    "code": "STORAGE_OBJECT_NOT_FOUND",
    "message": "上传文件不存在，请重新上传",
    "details": {}
  }
}
```

`details` 为可选字段。调用方应使用稳定的 `error.code` 编写分支逻辑，`message` 主要用于日志和界面提示。

## 5. 申请文件直传地址

### `POST /uploads/presign`

请求：

```json
{
  "fileName": "photo.heic",
  "mimeType": "image/heic",
  "size": 2048000
}
```

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `fileName` | string | 是 | 原始文件名，最长 255 字符 |
| `mimeType` | string | 是 | 文件 MIME 类型，最长 120 字符 |
| `size` | integer | 是 | 文件大小，单位字节；当前最大 50MB |

成功响应 `200`：

```json
{
  "objectKey": "uploads/2026/08/17/550e8400-e29b-41d4-a716-446655440000.heic",
  "uploadUrl": "https://storage.example.com/qingzhuan-files/uploads/...?X-Amz-Signature=...",
  "method": "PUT",
  "requiredHeaders": {
    "Content-Type": "image/heic"
  },
  "expiresAt": "2026-08-17T08:15:00.000Z"
}
```

## 6. 直传文件字节

向上一步返回的 `uploadUrl` 发起 `PUT`。该请求不使用 API Base URL，也不发送 JSON。

```bash
curl --request PUT "$UPLOAD_URL" \
  --header "Content-Type: image/heic" \
  --data-binary "@photo.heic"
```

注意：

- 必须使用返回的 `method` 和 `requiredHeaders`。
- `Content-Type` 必须与申请签名时的 `mimeType` 完全一致。
- HTTP 2xx 才表示上传成功。签名过期后需重新申请，不要继续创建转换任务。

## 7. 创建图片处理任务

### `POST /jobs`

请求：

```json
{
  "objectKey": "uploads/2026/08/17/550e8400-e29b-41d4-a716-446655440000.heic",
  "fileName": "photo.heic",
  "mimeType": "image/heic",
  "size": 2048000,
  "operation": "convert",
  "sourceFormat": "自动识别",
  "targetFormat": "WebP",
  "quality": 86,
  "scale": 1
}
```

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `objectKey` | string | 是 | 必须使用申请上传地址时返回的值 |
| `fileName` | string | 是 | 原始文件名 |
| `mimeType` | string | 是 | 必须与已上传对象一致 |
| `size` | integer | 是 | 必须与已上传对象实际字节数一致 |
| `operation` | enum | 否 | `convert/compress`，不传时默认为 `convert` |
| `sourceFormat` | enum | 是 | `自动识别/JPG/PNG/WebP/AVIF/HEIC/SVG/GIF/TIFF` |
| `targetFormat` | enum | 是 | 转换传 `WebP/JPG/PNG/AVIF/GIF/TIFF`；压缩必须传 `original` |
| `quality` | integer | 是 | `40-100`，主要影响有损格式 |
| `scale` | number | 是 | `0.1-1`，`1` 表示不缩放 |
| `compressionPreset` | enum | 压缩必填 | `high_quality/balanced/small_file/custom` |
| `resizeWidth` | integer | 否 | 自定义最大宽度，`1-40000`；与 `scale < 1` 不能同时使用 |
| `resizeHeight` | integer | 否 | 自定义最大高度，`1-40000`；与 `scale < 1` 不能同时使用 |

### 7.1 创建原格式压缩任务

压缩 JPG、PNG、WebP、AVIF、GIF 或 TIFF 时，上传步骤完全相同。压缩请求示例：

```json
{
  "objectKey": "uploads/2026/08/19/550e8400-e29b-41d4-a716-446655440000.jpg",
  "fileName": "photo.jpg",
  "mimeType": "image/jpeg",
  "size": 2048000,
  "operation": "compress",
  "sourceFormat": "自动识别",
  "targetFormat": "original",
  "compressionPreset": "balanced",
  "quality": 80,
  "scale": 1
}
```

固定比例缩放通过 `scale` 传 `0.75` 或 `0.5`。自定义尺寸时 `scale` 必须为 `1`，传入 `resizeWidth`、`resizeHeight` 中至少一个；Worker 将图片等比缩小到边界内且不会放大。`custom` 档位下 `quality` 才表示调用方的自定义编码质量，其他档位由 Worker 按真实格式映射编码参数。

压缩保持原格式。HEIC、SVG 和 BMP 不支持 `compress`；如需处理应创建 `convert` 任务。动态 GIF/WebP 和多页 TIFF 会保留全部帧，动态 AVIF 当前返回异步失败。

成功响应 `201`：

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "inputObjectKey": "uploads/2026/08/17/550e8400-e29b-41d4-a716-446655440000.heic",
  "originalName": "photo.heic",
  "mimeType": "image/heic",
  "byteSize": 2048000,
  "operation": "convert",
  "sourceFormat": "自动识别",
  "detectedSourceFormat": null,
  "targetFormat": "WebP",
  "resolvedTargetFormat": "WebP",
  "compressionPreset": null,
  "quality": 86,
  "scale": 1,
  "status": "queued",
  "errorCode": null,
  "errorMessage": null,
  "outputObjectKey": null,
  "outputMimeType": null,
  "outputByteSize": null,
  "createdAt": "2026-08-17T08:00:00.000Z",
  "updatedAt": "2026-08-17T08:00:00.000Z",
  "message": "任务已进入转换队列"
}
```

当前接口不支持幂等键。请求超时且无法确认服务端是否已创建任务时，不要无限自动重试，否则可能创建重复任务。

## 8. 查询图片处理任务

### `GET /jobs/{id}`

成功响应 `200`。任务完成时额外返回 `output`：

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "inputObjectKey": "uploads/2026/08/17/550e8400-e29b-41d4-a716-446655440000.heic",
  "originalName": "photo.heic",
  "mimeType": "image/heic",
  "byteSize": 2048000,
  "operation": "convert",
  "sourceFormat": "自动识别",
  "detectedSourceFormat": "HEIC",
  "targetFormat": "WebP",
  "resolvedTargetFormat": "WebP",
  "quality": 86,
  "scale": 1,
  "status": "completed",
  "errorCode": null,
  "errorMessage": null,
  "outputObjectKey": "converted/550e8400-e29b-41d4-a716-446655440000.webp",
  "outputMimeType": "image/webp",
  "outputByteSize": 182340,
  "createdAt": "2026-08-17T08:00:00.000Z",
  "updatedAt": "2026-08-17T08:00:03.000Z",
  "output": {
    "fileName": "photo.webp",
    "mimeType": "image/webp",
    "size": 182340,
    "downloadUrl": "/api/v1/jobs/550e8400-e29b-41d4-a716-446655440000/download"
  }
}
```

压缩任务完成时，`output` 额外包含压缩统计：

```json
{
  "fileName": "photo-compressed.jpg",
  "mimeType": "image/jpeg",
  "size": 512000,
  "originalSize": 2048000,
  "savedBytes": 1536000,
  "savingRate": 75,
  "keptOriginal": false,
  "downloadUrl": "/api/v1/jobs/550e8400-e29b-41d4-a716-446655440000/download"
}
```

原尺寸重新编码没有减小体积时，服务返回原文件，`keptOriginal` 为 `true`，`savedBytes` 和 `savingRate` 为 `0`。此时原文件元数据也会保留。存在实际缩放时尺寸要求优先，即使体积未下降也返回缩放结果。

建议调用方以 1 至 2 秒为初始间隔查询，运行时间较长时逐步退避，直到进入最终状态。

| 状态 | 是否最终状态 | 说明 |
| --- | --- | --- |
| `queued` | 否 | 已进入队列，等待 Worker |
| `processing` | 否 | Worker 正在转换或压缩 |
| `completed` | 是 | 图片处理完成，可以下载 |
| `failed` | 是 | 图片处理失败，查看 `errorCode` 和 `errorMessage` |
| `cancelled` | 是 | 已取消；当前版本没有公开取消接口 |
| `expired` | 是 | 文件超过 2 小时保存期限并已删除 |

## 9. 下载图片处理结果

### `GET /jobs/{id}/download`

仅 `completed` 状态可以下载。接口返回 `302`，`Location` 指向默认 15 分钟有效的对象存储签名地址。

```bash
curl --location \
  "https://qingzhuan-api.jason-ycx.top/api/v1/jobs/550e8400-e29b-41d4-a716-446655440000/download" \
  --output photo.webp
```

调用方必须允许跟随重定向。不要拼接或持久化任务响应中的 `outputObjectKey`，应使用 `output.downloadUrl` 或本下载接口。

## 10. 创建 ZIP 打包任务

只有所有图片处理任务都处于 `completed` 状态时才能创建。

### `POST /archives`

请求：

```json
{
  "jobIds": [
    "550e8400-e29b-41d4-a716-446655440000",
    "b6801c5d-2c81-4ed4-a37f-b73c2684e425"
  ]
}
```

`jobIds` 必须包含 1 至 10 个不重复的 UUID。

成功响应 `201`：

```json
{
  "id": "6954cc6e-4511-42ee-acce-fc920df13233",
  "jobIds": [
    "550e8400-e29b-41d4-a716-446655440000",
    "b6801c5d-2c81-4ed4-a37f-b73c2684e425"
  ],
  "status": "queued",
  "outputObjectKey": null,
  "outputByteSize": null,
  "errorMessage": null,
  "createdAt": "2026-08-17T08:00:10.000Z",
  "updatedAt": "2026-08-17T08:00:10.000Z"
}
```

## 11. 查询和下载 ZIP

### `GET /archives/{id}`

查询方式和状态含义与转换任务一致。完成时返回：

```json
{
  "id": "6954cc6e-4511-42ee-acce-fc920df13233",
  "jobIds": [
    "550e8400-e29b-41d4-a716-446655440000",
    "b6801c5d-2c81-4ed4-a37f-b73c2684e425"
  ],
  "status": "completed",
  "outputObjectKey": "archives/6954cc6e-4511-42ee-acce-fc920df13233.zip",
  "outputByteSize": 359120,
  "errorMessage": null,
  "createdAt": "2026-08-17T08:00:10.000Z",
  "updatedAt": "2026-08-17T08:00:13.000Z",
  "output": {
    "fileName": "qingzhuan-6954cc6e-4511-42ee-acce-fc920df13233.zip",
    "mimeType": "application/zip",
    "size": 359120,
    "downloadUrl": "/api/v1/archives/6954cc6e-4511-42ee-acce-fc920df13233/download"
  }
}
```

### `GET /archives/{id}/download`

仅 `completed` 状态可以下载。接口返回 `302`，调用方需要跟随重定向。

## 12. 支持格式和转换规则

支持的输入格式：JPG、PNG、WebP、AVIF、HEIC/HEIF、SVG、GIF、TIFF。

支持的输出格式：WebP、JPG、PNG、AVIF、GIF、TIFF。BMP 不在支持范围内。

- 动态 GIF/WebP/TIFF 输出为 GIF/WebP/AVIF 时保留动画。
- 动态图片输出为 JPG/PNG/TIFF 时只取首帧。
- HEIC 序列取主图。
- 透明图片转 JPG 时使用白色背景。
- 默认纠正 EXIF 方向并移除原始元数据。

原格式压缩支持 JPG、PNG、WebP、AVIF、GIF、TIFF：

- 高清、推荐、极致和自定义质量会按真实格式映射到各编码器，不能把质量数值理解为体积减少百分比。
- GIF、动态 WebP 和多页 TIFF 保留全部帧；动态 AVIF 当前不支持，任务以 `ANIMATED_AVIF_NOT_SUPPORTED` 失败。
- 重新编码默认纠正方向、转换为 sRGB 并移除元数据；无收益回退到原文件时保留原元数据。
- 自定义最大宽高始终等比缩小且不会放大。

## 13. 错误码

| HTTP 状态 | `error.code` | 说明 |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | 请求字段缺失、类型错误、超出范围或包含未定义字段 |
| 400 | `STORAGE_OBJECT_NOT_FOUND` | `objectKey` 对应的上传对象不存在 |
| 400 | `STORAGE_OBJECT_SIZE_MISMATCH` | 请求大小与已上传对象不一致 |
| 400 | `STORAGE_OBJECT_TYPE_MISMATCH` | 请求 MIME 类型与已上传对象不一致 |
| 400 | `INVALID_TARGET_FORMAT` | `convert` 与 `compress` 使用了不匹配的目标格式 |
| 400 | `INVALID_JOB_OPTIONS` | 格式转换任务携带了压缩专用参数 |
| 400 | `COMPRESSION_PRESET_REQUIRED` | 压缩任务没有提供压缩档位 |
| 400 | `UNSUPPORTED_COMPRESSION_FORMAT` | 明确提交了 HEIC、SVG 等不支持原格式压缩的源格式 |
| 400 | `INVALID_RESIZE_OPTIONS` | 比例缩放与自定义最大尺寸同时使用 |
| 404 | `JOB_NOT_FOUND` | 转换任务不存在；创建 ZIP 时也可能表示部分任务不存在 |
| 404 | `ARCHIVE_NOT_FOUND` | ZIP 任务不存在 |
| 409 | `JOB_NOT_COMPLETED` | 转换任务尚未完成，不能下载 |
| 409 | `JOBS_NOT_READY` | 部分转换任务尚未完成，不能创建 ZIP |
| 409 | `ARCHIVE_NOT_COMPLETED` | ZIP 尚未完成，不能下载 |
| 410 | `FILE_EXPIRED` | 转换文件或 ZIP 超过 2 小时保存期限并已删除 |
| 413 | `FILE_TOO_LARGE` | 文件超过单文件大小限制 |
| 415 | `UNSUPPORTED_FILE_TYPE` | MIME 类型不在支持范围内 |
| 503 | `QUEUE_UNAVAILABLE` | 转换队列暂时不可用 |
| 503 | `ARCHIVE_QUEUE_UNAVAILABLE` | ZIP 队列暂时不可用 |
| 500 | `INTERNAL_ERROR` | 未预期的服务端错误 |

异步 Worker 失败时 HTTP 查询仍返回任务对象，稳定错误码位于任务的 `errorCode` 字段：

| `errorCode` | 说明 |
| --- | --- |
| `UNSUPPORTED_COMPRESSION_FORMAT` | Worker 真实识别出的格式不支持原格式压缩 |
| `ANIMATED_AVIF_NOT_SUPPORTED` | 动态 AVIF 首版不支持原格式压缩 |
| `COMPRESSION_FAILED` | 文件损坏、编码器失败或其他压缩错误 |
| `CONVERSION_FAILED` | 文件损坏、编码器失败或其他转换错误 |

## 14. 调用方实现建议

- 为每个调用方业务记录保存轻转的 `job.id`，不要只依赖进程内状态。
- 只有 `queued` 和 `processing` 需要继续查询；其余状态均停止轮询。
- `failed` 时同时记录稳定的 `errorCode` 和可读的 `errorMessage`，由业务决定是否让用户重新上传或重新创建任务。
- 对 GET 查询可做带退避的网络重试；POST 创建任务没有幂等保证，不应盲目重试。
- 下载接口要允许 `302` 重定向，并以流式方式保存响应，避免把大文件完整读入内存。
- 原文件、转换结果和 ZIP 统一只保留 2 小时。需要长期保存时，调用方应在期限内下载到自己的存储。
