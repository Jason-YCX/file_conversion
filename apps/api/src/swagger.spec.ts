import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from "@nestjs/swagger";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ArchivesController } from "./archives/archives.controller";
import { ArchivesService } from "./archives/archives.service";
import { HealthController } from "./health/health.controller";
import { HealthService } from "./health/health.service";
import { JobsController } from "./jobs/jobs.controller";
import { JobsService } from "./jobs/jobs.service";
import { UploadsController } from "./uploads/uploads.controller";
import { UploadsService } from "./uploads/uploads.service";

function responseDescription(response: unknown) {
  if (typeof response !== "object" || response === null || !("description" in response)) {
    return undefined;
  }
  const description = (response as { description?: unknown }).description;
  return typeof description === "string" ? description : undefined;
}

describe("Swagger 对接文档", () => {
  let app: INestApplication;
  let document: OpenAPIObject;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [
        HealthController,
        UploadsController,
        JobsController,
        ArchivesController,
      ],
      providers: [
        { provide: HealthService, useValue: { check: () => undefined } },
        { provide: UploadsService, useValue: { presign: () => undefined } },
        {
          provide: JobsService,
          useValue: { create: () => undefined, findOne: () => undefined, download: () => undefined },
        },
        {
          provide: ArchivesService,
          useValue: { create: () => undefined, findOne: () => undefined, download: () => undefined },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle("轻转 API").setVersion("1.0").build(),
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it("为服务调用方提供中文摘要和响应模型", () => {
    const presign = document.paths["/api/v1/uploads/presign"]?.post;

    expect(presign?.summary).toBe("申请文件直传地址");
    expect(responseDescription(presign?.responses["200"])).toBe("签名地址申请成功");
    expect(document.components?.schemas?.PresignUploadResponseDto).toBeDefined();
    expect(document.components?.schemas?.ApiErrorResponseDto).toBeDefined();
    const createJob = document.paths["/api/v1/jobs"]?.post;
    expect(createJob?.summary).toBe("创建图片转换或压缩任务");
    expect(document.components?.schemas?.CreateJobDto).toBeDefined();
    expect(document.components?.schemas?.JobOutputDto).toBeDefined();
  });

  it("准确描述下载接口的 302 和业务错误", () => {
    const download = document.paths["/api/v1/jobs/{id}/download"]?.get;

    expect(download?.summary).toBe("下载图片处理结果");
    expect(responseDescription(download?.responses["302"])).toContain("跳转");
    expect(responseDescription(download?.responses["409"])).toContain("JOB_NOT_COMPLETED");
    expect(responseDescription(download?.responses["410"])).toContain("FILE_EXPIRED");
  });
});
