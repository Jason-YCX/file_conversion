import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { validateConfig } from "./config/app-config";
import { DatabaseModule } from "./database/database.module";
import { HealthModule } from "./health/health.module";
import { JobsModule } from "./jobs/jobs.module";
import { QueueModule } from "./queue/queue.module";
import { StorageModule } from "./storage/storage.module";
import { UploadsModule } from "./uploads/uploads.module";
import { ArchivesModule } from "./archives/archives.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [".env", "../../.env"],
      validate: validateConfig,
    }),
    DatabaseModule,
    StorageModule,
    QueueModule,
    HealthModule,
    UploadsModule,
    JobsModule,
    ArchivesModule,
  ],
})
export class AppModule {}
