import { HttpStatus, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiException } from "../common/api-exception";
import { StorageService } from "../storage/storage.service";
import { PresignUploadDto } from "./dto/presign-upload.dto";

const SUPPORTED_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/pjpeg",
  "image/png",
  "image/x-png",
  "image/webp",
  "image/avif",
  "image/heic",
  "image/heif",
  "image/svg+xml",
  "image/gif",
  "image/tiff",
  "image/x-tiff",
]);

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
    if (!SUPPORTED_IMAGE_MIME_TYPES.has(input.mimeType.toLowerCase())) {
      throw new ApiException(
        HttpStatus.UNSUPPORTED_MEDIA_TYPE,
        "UNSUPPORTED_FILE_TYPE",
        "当前阶段不支持该图片格式",
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
