const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");

const { app } = require("../dist/app");
const { AppDataSource } = require("../dist/data-source");

function request(server, path) {
  const address = server.address();
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port: address.port,
        path,
        method: "GET",
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          resolve({
            statusCode: res.statusCode,
            body: body ? JSON.parse(body) : null,
          });
        });
      }
    );
    req.on("error", reject);
    req.end();
  });
}

function listen() {
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => resolve(server));
  });
}

test("health endpoint reports unhealthy before the database is ready", async () => {
  const server = await listen();
  try {
    const response = await request(server, "/health");

    assert.equal(response.statusCode, 503);
    assert.equal(response.body.status, "unhealthy");
    assert.equal(response.body.database, "disconnected");
  } finally {
    server.close();
  }
});

test("liveness endpoint reports the process is running without requiring database readiness", async () => {
  const server = await listen();
  try {
    const response = await request(server, "/health/live");

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.status, "ok");
  } finally {
    server.close();
  }
});

test("health endpoint reports ok when the database readiness query succeeds", async () => {
  const originalIsInitialized = AppDataSource.isInitialized;
  const originalQuery = AppDataSource.query;

  AppDataSource.isInitialized = true;
  AppDataSource.query = async () => [{ ok: 1 }];

  const server = await listen();
  try {
    const response = await request(server, "/health");

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.status, "ok");
    assert.equal(response.body.database, "connected");
  } finally {
    server.close();
    AppDataSource.query = originalQuery;
    AppDataSource.isInitialized = originalIsInitialized;
  }
});
