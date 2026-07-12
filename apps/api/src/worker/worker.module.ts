import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { validateConfig } from "../config/app-config";
import { DatabaseModule } from "../database/database.module";
import { StorageModule } from "../storage/storage.module";
import { ArchiveProcessor } from "./archive.processor";
import { ConversionEngineService } from "./conversion-engine.service";
import { ConversionProcessor } from "./conversion.processor";
import { WorkerService } from "./worker.service";
import { FileCleanupService } from "./file-cleanup.service";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [".env", "../../.env"],
      validate: validateConfig,
    }),
    DatabaseModule,
    StorageModule,
  ],
  providers: [
    ConversionEngineService,
    ConversionProcessor,
    ArchiveProcessor,
    FileCleanupService,
    WorkerService,
  ],
})
export class WorkerModule {}
