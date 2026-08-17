import { ApiProperty } from "@nestjs/swagger";

export class PresignUploadResponseDto {
  @ApiProperty({
    description: "对象存储中的文件标识；创建转换任务时必须原样传回",
    example: "uploads/2026/08/17/550e8400-e29b-41d4-a716-446655440000.heic",
    type: String,
  })
  objectKey: string;

  @ApiProperty({
    description: "用于直传文件字节的临时签名地址，默认 15 分钟有效",
    example: "https://storage.example.com/qingzhuan-files/uploads/...?X-Amz-Signature=...",
    type: String,
  })
  uploadUrl: string;

  @ApiProperty({ description: "上传签名地址要求的 HTTP 方法", enum: ["PUT"], example: "PUT" })
  method: "PUT";

  @ApiProperty({
    description: "上传文件时必须携带的请求头，值必须与申请签名时一致",
    example: { "Content-Type": "image/heic" },
    type: Object,
  })
  requiredHeaders: Record<string, string>;

  @ApiProperty({
    description: "上传签名地址失效时间（ISO 8601）",
    example: "2026-08-17T08:15:00.000Z",
    type: String,
  })
  expiresAt: string;
}
