import { ApiProperty } from "@nestjs/swagger";
import { IsInt, IsNotEmpty, IsString, MaxLength, Min } from "class-validator";

export class PresignUploadDto {
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
}
