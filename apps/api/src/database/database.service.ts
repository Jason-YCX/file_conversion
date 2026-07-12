import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { join } from "node:path";
import { Pool } from "pg";
import * as schema from "./schema";

@Injectable()
export class DatabaseService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly pool: Pool;
  private migrationPromise?: Promise<void>;
  private migrated = false;
  readonly db: NodePgDatabase<typeof schema>;

  constructor(config: ConfigService) {
    this.pool = new Pool({
      connectionString: config.getOrThrow<string>("DATABASE_URL"),
      max: 10,
    });
    this.db = drizzle(this.pool, { schema });
  }

  async onModuleInit() {
    try {
      await this.ensureReady();
    } catch {
      this.logger.warn(
        "Database is not ready; the API will start in degraded mode and retry on health checks",
      );
    }
  }

  async ping() {
    await this.pool.query("select 1");
    if (!this.migrated) await this.ensureReady();
  }

  async onApplicationShutdown() {
    await this.pool.end();
  }

  private async ensureReady() {
    if (this.migrated) return;
    if (!this.migrationPromise) {
      this.migrationPromise = (async () => {
        await this.pool.query("select 1");
        await migrate(this.db, {
          migrationsFolder: join(process.cwd(), "drizzle"),
        });
        this.migrated = true;
      })().finally(() => {
        this.migrationPromise = undefined;
      });
    }
    await this.migrationPromise;
  }
}
