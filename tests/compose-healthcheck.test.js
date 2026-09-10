const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const rootDir = path.resolve(__dirname, "..");
const workspaceDir = path.resolve(rootDir, "..");

for (const relativePath of ["docker-compose.yml", "server/docker-compose.yml"]) {
  test(`${relativePath} API healthcheck handles HTTP connection errors`, () => {
    const source = fs.readFileSync(path.join(workspaceDir, relativePath), "utf8");

    assert.match(source, /localhost:3000\/health/);
    assert.match(source, /\.on\('error',\(\)=>process\.exit\(1\)\)/);
  });
}
