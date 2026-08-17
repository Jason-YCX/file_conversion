import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { JOB_STATUSES } from "../../jobs/dto/job-response.dto";

export class ArchiveOutputDto {
  @ApiProperty({
    description: "压缩包文件名",
    example: "qingzhuan-550e8400-e29b-41d4-a716-446655440000.zip",
    type: String,
  })
  fileName: string;

  @ApiProperty({ description: "压缩包 MIME 类型", enum: ["application/zip"] })
  mimeType: "application/zip";

  @ApiProperty({
    description: "压缩包大小（字节）",
    example: 359120,
    nullable: true,
    type: Number,
  })
  size: number | null;

  @ApiProperty({
    description: "压缩包下载接口相对路径；仅 completed 状态返回",
    example: "/api/v1/archives/550e8400-e29b-41d4-a716-446655440000/download",
    type: String,
  })
  downloadUrl: string;
}

export class ArchiveResponseDto {
  @ApiProperty({
    description: "压缩任务 ID",
    format: "uuid",
    example: "550e8400-e29b-41d4-a716-446655440000",
    type: String,
  })
  id: string;

  @ApiProperty({
    description: "需要打包的已完成转换任务 ID",
    type: [String],
    example: ["b6801c5d-2c81-4ed4-a37f-b73c2684e425"],
  })
  jobIds: string[];

  @ApiProperty({
    description:
      "任务状态：queued 排队中、processing 打包中、completed 已完成、failed 失败、cancelled 已取消、expired 文件已过期",
    enum: JOB_STATUSES,
    example: "completed",
  })
  status: (typeof JOB_STATUSES)[number];

  @ApiProperty({
    description: "压缩包对象标识；未完成时为 null",
    example: "archives/550e8400-e29b-41d4-a716-446655440000.zip",
    nullable: true,
    type: String,
  })
  outputObjectKey: string | null;

  @ApiProperty({
    description: "压缩包大小（字节）；未完成时为 null",
    example: 359120,
    nullable: true,
    type: Number,
  })
  outputByteSize: number | null;

  @ApiProperty({
    description: "失败原因；无错误时为 null",
    example: null,
    nullable: true,
    type: String,
  })
  errorMessage: string | null;

  @ApiProperty({
    description: "任务创建时间（ISO 8601）",
    example: "2026-08-17T08:00:10.000Z",
    type: String,
  })
  createdAt: string;

  @ApiProperty({
    description: "任务最后更新时间（ISO 8601）",
    example: "2026-08-17T08:00:13.000Z",
    type: String,
  })
  updatedAt: string;

  @ApiPropertyOptional({ description: "完成后的压缩包下载信息", type: ArchiveOutputDto })
  output?: ArchiveOutputDto;
}
