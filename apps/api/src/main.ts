import { Logger, ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { ApiExceptionFilter } from "./common/api-exception.filter";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const port = config.getOrThrow<number>("PORT");
  const origins = config
    .getOrThrow<string>("CORS_ORIGINS")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  app.enableCors({ origin: origins, methods: ["GET", "POST", "OPTIONS"] });
  app.enableShutdownHooks();
  app.setGlobalPrefix("api/v1");
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new ApiExceptionFilter());

  const swagger = new DocumentBuilder()
    .setTitle("轻转 API")
    .setDescription(
      "轻转服务端对接接口。调用顺序：申请直传地址 → PUT 上传文件 → 创建格式转换或图片压缩任务 → 查询状态 → 下载结果；批量下载需在所有图片处理任务完成后创建 ZIP 任务。当前接口未启用 API Key 或 OAuth 鉴权。",
    )
    .setVersion("1.0")
    .addTag("健康检查", "检查 API 依赖和图片处理 Worker 状态")
    .addTag("文件上传", "申请对象存储临时签名地址")
    .addTag("图片处理任务", "创建、查询和下载图片格式转换或原格式压缩任务")
    .addTag("批量下载", "创建、查询和下载 ZIP 压缩任务")
    .build();
  SwaggerModule.setup("docs", app, SwaggerModule.createDocument(app, swagger));

  await app.listen(port);
  Logger.log(`API running at http://localhost:${port}/api/v1`, "Bootstrap");
  Logger.log(`Swagger available at http://localhost:${port}/docs`, "Bootstrap");
}

void bootstrap();
