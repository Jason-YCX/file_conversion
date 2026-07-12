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
    .setDescription("轻转文件上传与转换任务 API")
    .setVersion("1.0")
    .build();
  SwaggerModule.setup("docs", app, SwaggerModule.createDocument(app, swagger));

  await app.listen(port);
  Logger.log(`API running at http://localhost:${port}/api/v1`, "Bootstrap");
  Logger.log(`Swagger available at http://localhost:${port}/docs`, "Bootstrap");
}

void bootstrap();
