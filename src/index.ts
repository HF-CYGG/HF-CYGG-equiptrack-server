import { app } from "./app";
import { env } from "./config/env";
import { AppDataSource } from "./data-source";
import { migrateJsonToSqlIfNeeded } from "./sync_json_to_sql";
import { ensureDatabaseSchema } from "./utils/schema_fix";
import { promises as fs } from "fs";
import path from "path";

const BOOT_LOG = path.join(process.cwd(), "boot.log");
async function logBoot(msg: string) {
  try {
    await fs.appendFile(BOOT_LOG, `[${new Date().toISOString()}] ${msg}\n`, "utf8");
  } catch (_) {}
}

logBoot("index.ts: starting");

let server = app.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`EquipTrack server listening on port ${env.PORT}`);
  logBoot(`listening on ${env.PORT}`);
});

function shutdown(signal: string) {
  // eslint-disable-next-line no-console
  console.log(`Received ${signal}, closing server...`);
  server.close(() => {
    // eslint-disable-next-line no-console
    console.log("Server closed. Bye.");
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// Initialize Database
AppDataSource.initialize().then(async () => {
  console.log("Database initialized");
  logBoot("database initialized");
  
  // Ensure schema is up to date (for environments without auto-sync)
  await ensureDatabaseSchema();

  try {
    await migrateJsonToSqlIfNeeded();
  } catch (err) {
    console.error("JSON→SQL migration error:", err);
    logBoot("json_to_sql_migration_failed");
  }
}).catch((err) => {
  console.error("Failed to initialize database:", err);
  logBoot("database initialization failed");
});
