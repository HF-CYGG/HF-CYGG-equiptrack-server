const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const rootDir = path.resolve(__dirname, "..");
const packageJsonPath = path.join(rootDir, "package.json");

test("production start script loads dotenv configuration before server bootstrap", () => {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

  assert.equal(packageJson.scripts.start, "node -r dotenv/config dist/server.js");
});
