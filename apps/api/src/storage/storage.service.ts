import {
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import type { Readable } from "node:stream";

export type StoredObject = {
  size: number;
  contentType?: string;
};

@Injectable()
export class StorageService {
  private readonly client: S3Client;
  private readonly signingClient: S3Client;
  private readonly bucket: string;
  private readonly expiresIn: number;
  private readonly downloadExpiresIn: number;

  constructor(config: ConfigService) {
    this.bucket = config.getOrThrow<string>("S3_BUCKET");
    this.expiresIn = config.getOrThrow<number>(
      "UPLOAD_URL_EXPIRES_SECONDS",
    );
    this.downloadExpiresIn = config.getOrThrow<number>(
      "DOWNLOAD_URL_EXPIRES_SECONDS",
    );
    const commonClientConfig = {
      region: config.getOrThrow<string>("S3_REGION"),
      forcePathStyle: config.getOrThrow<boolean>("S3_FORCE_PATH_STYLE"),
      credentials: {
        accessKeyId: config.getOrThrow<string>("S3_ACCESS_KEY_ID"),
        secretAccessKey: config.getOrThrow<string>("S3_SECRET_ACCESS_KEY"),
      },
    };
    this.client = new S3Client({
      ...commonClientConfig,
      endpoint: config.getOrThrow<string>("S3_ENDPOINT"),
    });
    this.signingClient = new S3Client({
      ...commonClientConfig,
      endpoint: config.getOrThrow<string>("S3_PUBLIC_ENDPOINT"),
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
    const uploadUrl = await getSignedUrl(this.signingClient, command, {
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

  async getObjectBuffer(objectKey: string) {
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: objectKey }),
    );
    if (!result.Body) throw new Error("Stored object has no body");
    return Buffer.from(await result.Body.transformToByteArray());
  }

  async getObjectStream(objectKey: string) {
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: objectKey }),
    );
    if (!result.Body) throw new Error("Stored object has no body");
    return result.Body as Readable;
  }

  async putObject(objectKey: string, body: Buffer, contentType: string) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async uploadStream(objectKey: string, body: Readable, contentType: string) {
    await new Upload({
      client: this.client,
      params: { Bucket: this.bucket, Key: objectKey, Body: body, ContentType: contentType },
    }).done();
  }

  async createDownloadUrl(objectKey: string, fileName: string, mimeType: string) {
    const disposition = `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`;
    return getSignedUrl(
      this.signingClient,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
        ResponseContentDisposition: disposition,
        ResponseContentType: mimeType,
      }),
      { expiresIn: this.downloadExpiresIn },
    );
  }

  async deleteObjectsOlderThan(prefixes: string[], cutoff: Date) {
    let deleted = 0;
    for (const prefix of prefixes) {
      let continuationToken: string | undefined;
      do {
        const page = await this.client.send(
          new ListObjectsV2Command({
            Bucket: this.bucket,
            Prefix: prefix,
            ContinuationToken: continuationToken,
          }),
        );
        const keys = (page.Contents ?? [])
          .filter((object) => object.Key && object.LastModified && object.LastModified <= cutoff)
          .map((object) => ({ Key: object.Key! }));
        if (keys.length) {
          await this.client.send(
            new DeleteObjectsCommand({
              Bucket: this.bucket,
              Delete: { Objects: keys, Quiet: true },
            }),
          );
          deleted += keys.length;
        }
        continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (continuationToken);
    }
    return deleted;
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
