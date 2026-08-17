import { ApiProperty } from "@nestjs/swagger";
import { IsInt, IsNotEmpty, IsString, MaxLength, Min } from "class-validator";

export class PresignUploadDto {
  @ApiProperty({
    description: "原始文件名，用于保留安全的文件扩展名",
    example: "photo.heic",
    maxLength: 255,
    type: String,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  fileName: string;

  @ApiProperty({
    description: "文件 MIME 类型；直传时的 Content-Type 必须与该值一致",
    example: "image/heic",
    maxLength: 120,
    type: String,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  mimeType: string;

  @ApiProperty({
    description: "文件大小（字节），当前单文件最大 50MB",
    example: 2048000,
    minimum: 1,
    maximum: 52428800,
    type: Number,
  })
  @IsInt()
  @Min(1)
  size: number;
}
