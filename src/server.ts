import { app } from "./app";
import { env } from "./config/env";
import { AppDataSource } from "./data-source";
import { migrateJsonToSqlIfNeeded } from "./sync_json_to_sql";
import { ensureDatabaseSchema } from "./utils/schema_fix";
import { startDatabaseWatchdog } from "./database-watchdog";
import { promises as fs } from "fs";
import path from "path";

const BOOT_LOG = path.join(process.cwd(), "boot.log");

async function logBoot(msg: string) {
  try {
    await fs.appendFile(BOOT_LOG, `[${new Date().toISOString()}] ${msg}\n`, "utf8");
  } catch (_) {
    // Boot logging must never block startup or shutdown.
  }
}

let server: ReturnType<typeof app.listen> | undefined;

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function initializeDatabaseWithRetry() {
  const maxAttempts = Math.max(1, env.DB_CONNECT_RETRIES);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await AppDataSource.initialize();
      console.log("Database initialized");
      await logBoot("database initialized");
      return;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Database initialization failed (${attempt}/${maxAttempts}):`, err);
      await logBoot(`database initialization failed (${attempt}/${maxAttempts}): ${message}`);

      if (attempt === maxAttempts) {
        throw err;
      }

      await sleep(env.DB_CONNECT_RETRY_DELAY_MS);
    }
  }
}

function shutdown(signal: string) {
  console.log(`Received ${signal}, closing server...`);

  if (!server) {
    process.exit(0);
  }

  server.close(() => {
    console.log("Server closed. Bye.");
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

async function bootstrap() {
  await logBoot("server.ts: starting");
  await initializeDatabaseWithRetry();
  await ensureDatabaseSchema();

  try {
    await migrateJsonToSqlIfNeeded();
  } catch (err) {
    console.error("JSON-to-SQL migration error:", err);
    await logBoot("json_to_sql_migration_failed");
  }

  server = app.listen(env.PORT, () => {
    console.log(`EquipTrack server listening on port ${env.PORT}`);
    logBoot(`listening on ${env.PORT}`);
  });
  startDatabaseWatchdog();
}

bootstrap().catch(async (err) => {
  console.error("Failed to start server:", err);
  await logBoot("server startup failed");
  process.exit(1);
});
