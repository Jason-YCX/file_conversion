import { ApiProperty } from "@nestjs/swagger";
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import {
  COMPRESSION_PRESETS,
  JOB_OPERATIONS,
  ORIGINAL_TARGET_FORMAT,
  SOURCE_FORMATS,
  TARGET_FORMATS,
  type CompressionPreset,
  type JobOperation,
  type RequestedTargetFormat,
  type SourceFormat,
} from "../../conversion/formats";

export class CreateJobDto {
  @ApiProperty({
    description: "任务类型；不传时保持原有格式转换行为",
    enum: JOB_OPERATIONS,
    default: "convert",
    required: false,
    type: String,
  })
  @IsOptional()
  @IsIn(JOB_OPERATIONS)
  operation?: JobOperation;

  @ApiProperty({
    description: "申请上传签名接口返回的 objectKey，必须原样传入",
    example: "uploads/2026/08/17/550e8400-e29b-41d4-a716-446655440000.heic",
    maxLength: 600,
    type: String,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(600)
  objectKey: string;

  @ApiProperty({
    description: "原始文件名",
    example: "photo.heic",
    maxLength: 255,
    type: String,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  fileName: string;

  @ApiProperty({
    description: "文件 MIME 类型，必须与对象存储中的 Content-Type 一致",
    example: "image/heic",
    maxLength: 120,
    type: String,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  mimeType: string;

  @ApiProperty({
    description: "文件大小（字节），必须与已上传对象的实际大小一致",
    example: 2048000,
    minimum: 1,
    type: Number,
  })
  @IsInt()
  @Min(1)
  size: number;

  @ApiProperty({
    description: "源格式；不确定时传“自动识别”",
    enum: SOURCE_FORMATS,
    example: "自动识别",
  })
  @IsIn(SOURCE_FORMATS)
  sourceFormat: SourceFormat;

  @ApiProperty({
    description: "目标格式；压缩任务必须传 original，表示保持原格式",
    enum: [...TARGET_FORMATS, ORIGINAL_TARGET_FORMAT],
    example: "WebP",
  })
  @IsIn([...TARGET_FORMATS, ORIGINAL_TARGET_FORMAT])
  targetFormat: RequestedTargetFormat;

  @ApiProperty({
    description: "压缩档位；仅压缩任务使用",
    enum: COMPRESSION_PRESETS,
    example: "balanced",
    required: false,
    type: String,
  })
  @IsOptional()
  @IsIn(COMPRESSION_PRESETS)
  compressionPreset?: CompressionPreset;

  @ApiProperty({
    description: "输出画质；主要影响 JPG、WebP、AVIF 和 GIF",
    minimum: 40,
    maximum: 100,
    example: 86,
    type: Number,
  })
  @IsInt()
  @Min(40)
  @Max(100)
  quality: number;

  @ApiProperty({
    description: "按原图尺寸缩放的比例，1 表示不缩放",
    minimum: 0.1,
    maximum: 1,
    example: 1,
    type: Number,
  })
  @IsNumber()
  @Min(0.1)
  @Max(1)
  scale: number;

  @ApiProperty({
    description: "自定义最大宽度（像素）；与最大高度共同构成等比缩放边界",
    minimum: 1,
    maximum: 40000,
    required: false,
    type: Number,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(40000)
  resizeWidth?: number;

  @ApiProperty({
    description: "自定义最大高度（像素）；与最大宽度共同构成等比缩放边界",
    minimum: 1,
    maximum: 40000,
    required: false,
    type: Number,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(40000)
  resizeHeight?: number;
}
