import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import { QueueService } from "../queue/queue.service";
import { StorageService } from "../storage/storage.service";

type ServiceStatus = "up" | "down";

@Injectable()
export class HealthService {
  constructor(
    private readonly database: DatabaseService,
    private readonly queue: QueueService,
    private readonly storage: StorageService,
  ) {}

  async check() {
    const [database, redis, storage] = await Promise.all([
      this.status(() => this.database.ping()),
      this.status(() => this.queue.ping()),
      this.status(() => this.storage.ping()),
    ]);
    const services = { database, redis, storage };
    const isHealthy = Object.values(services).every((value) => value === "up");

    return {
      status: isHealthy ? ("ok" as const) : ("degraded" as const),
      services,
      conversionEngine: "disabled" as const,
      timestamp: new Date().toISOString(),
    };
  }

  private async status(check: () => Promise<unknown>): Promise<ServiceStatus> {
    try {
      await check();
      return "up";
    } catch {
      return "down";
    }
  }
}
