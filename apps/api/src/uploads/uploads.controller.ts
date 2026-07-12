import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { PresignUploadDto } from "./dto/presign-upload.dto";
import { UploadsService } from "./uploads.service";

@ApiTags("uploads")
@Controller("uploads")
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Post("presign")
  @HttpCode(200)
  @ApiOkResponse({ description: "Returns a signed S3-compatible PUT URL" })
  presign(@Body() body: PresignUploadDto) {
    return this.uploads.presign(body);
  }
}
