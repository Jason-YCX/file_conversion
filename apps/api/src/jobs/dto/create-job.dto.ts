import { ApiProperty } from "@nestjs/swagger";
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import {
  SOURCE_FORMATS,
  TARGET_FORMATS,
  type SourceFormat,
  type TargetFormat,
} from "../../conversion/formats";

export class CreateJobDto {
  @ApiProperty({ example: "uploads/2026/07/11/uuid.heic" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(600)
  objectKey: string;

  @ApiProperty({ example: "photo.heic" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  fileName: string;

  @ApiProperty({ example: "image/heic" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  mimeType: string;

  @ApiProperty({ example: 2048000 })
  @IsInt()
  @Min(1)
  size: number;

  @ApiProperty({ enum: SOURCE_FORMATS, example: "自动识别" })
  @IsIn(SOURCE_FORMATS)
  sourceFormat: SourceFormat;

  @ApiProperty({ enum: TARGET_FORMATS, example: "WebP" })
  @IsIn(TARGET_FORMATS)
  targetFormat: TargetFormat;

  @ApiProperty({ minimum: 40, maximum: 100, example: 86 })
  @IsInt()
  @Min(40)
  @Max(100)
  quality: number;

  @ApiProperty({ minimum: 0.1, maximum: 1, example: 1 })
  @IsNumber()
  @Min(0.1)
  @Max(1)
  scale: number;
}
