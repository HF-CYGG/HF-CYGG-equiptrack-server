const assert = require("node:assert/strict");
const test = require("node:test");

const { nextDatabaseWatchdogState } = require("../dist/database-watchdog");

test("database watchdog exits only after consecutive failures reach the threshold", () => {
  let state = { consecutiveFailures: 0 };

  let result = nextDatabaseWatchdogState(state, false, 3);
  assert.equal(result.consecutiveFailures, 1);
  assert.equal(result.shouldExit, false);

  result = nextDatabaseWatchdogState(result, false, 3);
  assert.equal(result.consecutiveFailures, 2);
  assert.equal(result.shouldExit, false);

  result = nextDatabaseWatchdogState(result, false, 3);
  assert.equal(result.consecutiveFailures, 3);
  assert.equal(result.shouldExit, true);
});

test("database watchdog resets consecutive failures after a healthy check", () => {
  const result = nextDatabaseWatchdogState({ consecutiveFailures: 2 }, true, 3);

  assert.equal(result.consecutiveFailures, 0);
  assert.equal(result.shouldExit, false);
});
