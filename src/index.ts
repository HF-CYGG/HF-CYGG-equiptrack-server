import { app } from "./app";
import { env } from "./config/env";
import { AppDataSource } from "./data-source";
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
AppDataSource.initialize().then(() => {
  console.log("Database initialized");
  logBoot("database initialized");
}).catch((err) => {
  console.error("Failed to initialize database:", err);
  logBoot("database initialization failed");
});