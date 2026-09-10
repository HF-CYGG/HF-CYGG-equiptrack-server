import { env } from "./config/env";
import { getDatabaseHealth } from "./health";

export type DatabaseWatchdogState = {
  consecutiveFailures: number;
};

export type DatabaseWatchdogResult = DatabaseWatchdogState & {
  shouldExit: boolean;
};

export function nextDatabaseWatchdogState(
  state: DatabaseWatchdogState,
  healthy: boolean,
  failureThreshold: number
): DatabaseWatchdogResult {
  if (healthy) {
    return {
      consecutiveFailures: 0,
      shouldExit: false,
    };
  }

  const consecutiveFailures = state.consecutiveFailures + 1;
  return {
    consecutiveFailures,
    shouldExit: consecutiveFailures >= Math.max(1, failureThreshold),
  };
}

export function startDatabaseWatchdog() {
  let state: DatabaseWatchdogState = { consecutiveFailures: 0 };

  const timer = setInterval(async () => {
    const health = await getDatabaseHealth();
    const result = nextDatabaseWatchdogState(
      state,
      health.ready,
      env.DB_WATCHDOG_FAILURE_THRESHOLD
    );
    state = { consecutiveFailures: result.consecutiveFailures };

    if (!health.ready) {
      console.error(
        `Database watchdog failure ${state.consecutiveFailures}/${env.DB_WATCHDOG_FAILURE_THRESHOLD}: ${health.error || "database disconnected"}`
      );
    }

    if (result.shouldExit) {
      console.error("Database watchdog threshold reached; exiting for container restart.");
      process.exit(1);
    }
  }, env.DB_WATCHDOG_INTERVAL_MS);

  timer.unref();
  return timer;
}
