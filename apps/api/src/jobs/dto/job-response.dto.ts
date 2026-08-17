import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { SOURCE_FORMATS, TARGET_FORMATS } from "../../conversion/formats";

export const JOB_STATUSES = [
  "queued",
  "processing",
  "completed",
  "failed",
  "cancelled",
  "expired",
] as const;

export class JobOutputDto {
  @ApiProperty({ description: "转换后的下载文件名", example: "photo.webp", type: String })
  fileName: string;

  @ApiProperty({
    description: "转换后文件的 MIME 类型",
    example: "image/webp",
    type: String,
  })
  mimeType: string;

  @ApiProperty({
    description: "转换后文件大小（字节）",
    example: 182340,
    nullable: true,
    type: Number,
  })
  size: number | null;

  @ApiProperty({
    description: "下载接口相对路径；仅 completed 状态返回",
    example: "/api/v1/jobs/550e8400-e29b-41d4-a716-446655440000/download",
    type: String,
  })
  downloadUrl: string;
}

export class JobResponseDto {
  @ApiProperty({
    description: "转换任务 ID",
    format: "uuid",
    example: "550e8400-e29b-41d4-a716-446655440000",
    type: String,
  })
  id: string;

  @ApiProperty({
    description: "原文件在对象存储中的标识",
    example: "uploads/2026/08/17/550e8400-e29b-41d4-a716-446655440000.heic",
    type: String,
  })
  inputObjectKey: string;

  @ApiProperty({ description: "原始文件名", example: "photo.heic", type: String })
  originalName: string;

  @ApiProperty({ description: "原文件 MIME 类型", example: "image/heic", type: String })
  mimeType: string;

  @ApiProperty({ description: "原文件大小（字节）", example: 2048000, type: Number })
  byteSize: number;

  @ApiProperty({ description: "调用方提交的源格式", enum: SOURCE_FORMATS, example: "自动识别" })
  sourceFormat: string;

  @ApiProperty({
    description: "Worker 实际识别出的源格式；处理前可能为 null",
    enum: SOURCE_FORMATS.filter((format) => format !== "自动识别"),
    example: "HEIC",
    nullable: true,
    type: String,
  })
  detectedSourceFormat: string | null;

  @ApiProperty({ description: "目标格式", enum: TARGET_FORMATS, example: "WebP" })
  targetFormat: string;

  @ApiProperty({
    description: "有损格式的画质参数",
    minimum: 40,
    maximum: 100,
    example: 86,
    type: Number,
  })
  quality: number;

  @ApiProperty({
    description: "图片缩放比例",
    minimum: 0.1,
    maximum: 1,
    example: 1,
    type: Number,
  })
  scale: number;

  @ApiProperty({
    description:
      "任务状态：queued 排队中、processing 转换中、completed 已完成、failed 失败、cancelled 已取消、expired 文件已过期",
    enum: JOB_STATUSES,
    example: "completed",
  })
  status: (typeof JOB_STATUSES)[number];

  @ApiProperty({
    description: "失败原因；无错误时为 null",
    example: null,
    nullable: true,
    type: String,
  })
  errorMessage: string | null;

  @ApiProperty({
    description: "转换结果对象标识；未完成时为 null",
    example: "converted/550e8400-e29b-41d4-a716-446655440000.webp",
    nullable: true,
    type: String,
  })
  outputObjectKey: string | null;

  @ApiProperty({
    description: "转换结果 MIME 类型；未完成时为 null",
    example: "image/webp",
    nullable: true,
    type: String,
  })
  outputMimeType: string | null;

  @ApiProperty({
    description: "转换结果大小（字节）；未完成时为 null",
    example: 182340,
    nullable: true,
    type: Number,
  })
  outputByteSize: number | null;

  @ApiProperty({
    description: "任务创建时间（ISO 8601）",
    example: "2026-08-17T08:00:00.000Z",
    type: String,
  })
  createdAt: string;

  @ApiProperty({
    description: "任务最后更新时间（ISO 8601）",
    example: "2026-08-17T08:00:03.000Z",
    type: String,
  })
  updatedAt: string;

  @ApiPropertyOptional({
    description: "排队状态提示",
    example: "任务已进入转换队列",
    type: String,
  })
  message?: string;

  @ApiPropertyOptional({ description: "完成后的下载信息", type: JobOutputDto })
  output?: JobOutputDto;
}
