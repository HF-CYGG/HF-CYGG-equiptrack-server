import { app } from "./app";
import { env } from "./config/env";
import { initStore } from "./utils/store";
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

// Initialize data store then ensure server is live (for environments需要显式初始化)
initStore().then(() => {
  // no-op: app.ts 已调用，但这里再次确保（幂等）
  logBoot("store initialized");
}).catch(() => {
  // eslint-disable-next-line no-console
  console.warn("Failed to initialize data store at startup.");
  logBoot("store initialization failed");
});