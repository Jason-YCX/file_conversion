import { HttpStatus, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiException } from "../common/api-exception";
import { StorageService } from "../storage/storage.service";
import { PresignUploadDto } from "./dto/presign-upload.dto";

@Injectable()
export class UploadsService {
  private readonly maxUploadBytes: number;

  constructor(
    config: ConfigService,
    private readonly storage: StorageService,
  ) {
    this.maxUploadBytes = config.getOrThrow<number>("MAX_UPLOAD_BYTES");
  }

  async presign(input: PresignUploadDto) {
    if (!input.mimeType.startsWith("image/")) {
      throw new ApiException(
        HttpStatus.UNSUPPORTED_MEDIA_TYPE,
        "UNSUPPORTED_FILE_TYPE",
        "当前阶段仅支持图片文件",
      );
    }
    if (input.size > this.maxUploadBytes) {
      throw new ApiException(
        HttpStatus.PAYLOAD_TOO_LARGE,
        "FILE_TOO_LARGE",
        `单个文件不能超过 ${Math.floor(this.maxUploadBytes / 1024 / 1024)}MB`,
        { maxUploadBytes: this.maxUploadBytes },
      );
    }

    return this.storage.createUpload(input.fileName, input.mimeType);
  }
}
