import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { join } from "node:path";
import { Pool } from "pg";

try {
  process.loadEnvFile?.();
} catch {
  // The local .env file is optional because development defaults are provided.
}

async function run() {
  const pool = new Pool({
    connectionString:
      process.env.DATABASE_URL ??
      "postgresql://qingzhuan:qingzhuan@localhost:5432/qingzhuan",
  });

  try {
    await migrate(drizzle(pool), {
      migrationsFolder: join(process.cwd(), "drizzle"),
    });
    console.log("Database migrations completed");
  } finally {
    await pool.end();
  }
}

void run();
