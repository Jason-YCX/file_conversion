import {
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";

export type StoredObject = {
  size: number;
  contentType?: string;
};

@Injectable()
export class StorageService {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly expiresIn: number;

  constructor(config: ConfigService) {
    this.bucket = config.getOrThrow<string>("S3_BUCKET");
    this.expiresIn = config.getOrThrow<number>(
      "UPLOAD_URL_EXPIRES_SECONDS",
    );
    this.client = new S3Client({
      endpoint: config.getOrThrow<string>("S3_ENDPOINT"),
      region: config.getOrThrow<string>("S3_REGION"),
      forcePathStyle: config.getOrThrow<boolean>("S3_FORCE_PATH_STYLE"),
      credentials: {
        accessKeyId: config.getOrThrow<string>("S3_ACCESS_KEY_ID"),
        secretAccessKey: config.getOrThrow<string>("S3_SECRET_ACCESS_KEY"),
      },
    });
  }

  async createUpload(fileName: string, mimeType: string) {
    const extension = this.safeExtension(fileName);
    const day = new Date().toISOString().slice(0, 10).replaceAll("-", "/");
    const objectKey = `uploads/${day}/${randomUUID()}${extension}`;
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: objectKey,
      ContentType: mimeType,
    });
    const uploadUrl = await getSignedUrl(this.client, command, {
      expiresIn: this.expiresIn,
    });

    return {
      objectKey,
      uploadUrl,
      method: "PUT" as const,
      requiredHeaders: { "Content-Type": mimeType },
      expiresAt: new Date(Date.now() + this.expiresIn * 1000).toISOString(),
    };
  }

  async headObject(objectKey: string): Promise<StoredObject | null> {
    try {
      const result = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: objectKey }),
      );
      return {
        size: result.ContentLength ?? 0,
        ...(result.ContentType ? { contentType: result.ContentType } : {}),
      };
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } })
        .$metadata?.httpStatusCode;
      if (status === 404) return null;
      throw error;
    }
  }

  async ping() {
    await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
  }

  private safeExtension(fileName: string) {
    const plainName = fileName.replaceAll("\\", "/").split("/").pop() ?? "";
    const match = plainName.match(/\.[a-z0-9]{1,10}$/i);
    return match ? match[0].toLowerCase() : "";
  }
}
