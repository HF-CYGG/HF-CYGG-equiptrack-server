const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const rootDir = path.resolve(__dirname, "..");
const deployScriptPath = path.join(rootDir, "scripts", "deploy-api.sh");

test("deployment script is compatible with /bin/sh environments", () => {
  const source = fs.readFileSync(deployScriptPath, "utf8");

  assert.match(source, /^#!\/bin\/sh/);
  assert.doesNotMatch(source, /BASH_SOURCE|pipefail/);
});

test("deployment script starts an existing stopped MySQL container before API rollout", () => {
  const source = fs.readFileSync(deployScriptPath, "utf8");

  assert.match(source, /docker start "\$MYSQL_CONTAINER"/);
  assert.match(source, /Waiting for MySQL readiness/);
});

test("deployment script fails early when required production env keys are missing", () => {
  const source = fs.readFileSync(deployScriptPath, "utf8");

  for (const key of ["JWT_SECRET", "MYSQL_USER", "MYSQL_PASSWORD", "MYSQL_DATABASE"]) {
    assert.match(source, new RegExp(`require_env_key ${key}`));
  }
});
