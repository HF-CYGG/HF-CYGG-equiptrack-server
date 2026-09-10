const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const rootDir = path.resolve(__dirname, "..");
const indexPath = path.join(rootDir, "src", "index.ts");

test("legacy index entrypoint delegates to the stable server bootstrap", () => {
  const source = fs.readFileSync(indexPath, "utf8").trim();

  assert.equal(source, 'import "./server";');
});
