import { env } from "./config/env";
import { AppDataSource } from "./data-source";

export type DatabaseHealth = {
  ready: boolean;
  database: "connected" | "disconnected";
  error?: string;
};

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Database health check timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      }
    );
  });
}

export async function getDatabaseHealth(): Promise<DatabaseHealth> {
  if (!AppDataSource.isInitialized) {
    return {
      ready: false,
      database: "disconnected",
      error: "Data source is not initialized",
    };
  }

  try {
    await withTimeout(AppDataSource.query("SELECT 1"), env.DB_HEALTHCHECK_TIMEOUT_MS);
    return {
      ready: true,
      database: "connected",
    };
  } catch (error) {
    return {
      ready: false,
      database: "disconnected",
      error: error instanceof Error ? error.message : "Database health check failed",
    };
  }
}
