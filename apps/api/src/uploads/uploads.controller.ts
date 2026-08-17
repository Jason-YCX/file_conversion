import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiUnsupportedMediaTypeResponse,
} from "@nestjs/swagger";
import { ApiErrorResponseDto } from "../common/dto/api-error-response.dto";
import { PresignUploadDto } from "./dto/presign-upload.dto";
import { PresignUploadResponseDto } from "./dto/presign-upload-response.dto";
import { UploadsService } from "./uploads.service";

@ApiTags("文件上传")
@Controller("uploads")
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Post("presign")
  @HttpCode(200)
  @ApiOperation({
    summary: "申请文件直传地址",
    description:
      "校验图片类型和大小后，返回对象存储 PUT 签名地址。调用方必须先上传文件，再使用 objectKey 创建转换任务。",
  })
  @ApiOkResponse({ description: "签名地址申请成功", type: PresignUploadResponseDto })
  @ApiBadRequestResponse({ description: "请求参数不正确", type: ApiErrorResponseDto })
  @ApiUnsupportedMediaTypeResponse({
    description: "文件类型不支持（UNSUPPORTED_FILE_TYPE）",
    type: ApiErrorResponseDto,
  })
  @ApiResponse({
    status: 413,
    description: "文件超过大小限制（FILE_TOO_LARGE）",
    type: ApiErrorResponseDto,
  })
  presign(@Body() body: PresignUploadDto) {
    return this.uploads.presign(body);
  }
}
