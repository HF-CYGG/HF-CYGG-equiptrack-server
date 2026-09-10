const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const rootDir = path.resolve(__dirname, "..");

// 只检查本仓库的编排文件。
// 此前还会去父目录找一份 docker-compose.yml —— 那是服务端仓库作为子目录
// 嵌在主仓库工作区里时的布局，独立检出（CI 就是这样）时根本不存在。
// 现在编排统一收在本仓库，路径也就固定了。
test("docker-compose.yml API healthcheck handles HTTP connection errors", () => {
  const source = fs.readFileSync(path.join(rootDir, "docker-compose.yml"), "utf8");

  assert.match(source, /localhost:3000\/health/);
  assert.match(source, /\.on\('error',\(\)=>process\.exit\(1\)\)/);
});
