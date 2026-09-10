const nodeEnv = process.env.NODE_ENV || "development";
const isProduction = nodeEnv === "production";

/**
 * 读取必须存在的环境变量。
 * 生产环境缺失时直接终止启动，避免静默回退到不安全的默认值。
 */
function requireEnv(name: string, devFallback: string): string {
  const value = process.env[name];
  if (value && value.trim()) return value;

  if (isProduction) {
    console.error(`[配置错误] 生产环境必须设置环境变量 ${name}，服务拒绝启动。`);
    process.exit(1);
  }
  return devFallback;
}

const jwtSecret = requireEnv("JWT_SECRET", "equiptrack-dev-secret");

if (isProduction && jwtSecret.length < 32) {
  console.error("[配置错误] 生产环境 JWT_SECRET 长度必须不小于 32 个字符，服务拒绝启动。");
  process.exit(1);
}

const corsOrigin = process.env.CORS_ORIGIN || (isProduction ? "" : "*");

if (isProduction && (!corsOrigin || corsOrigin.trim() === "*")) {
  console.error("[配置错误] 生产环境必须把 CORS_ORIGIN 设为明确的来源列表，不允许为空或 \"*\"，服务拒绝启动。");
  process.exit(1);
}

export const env = {
  NODE_ENV: nodeEnv,
  PORT: Number(process.env.PORT || 3000),
  JWT_SECRET: jwtSecret,
  CORS_ORIGIN: corsOrigin,
  RATE_LIMIT_WINDOW_MS: Number(process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  RATE_LIMIT_MAX: Number(process.env.RATE_LIMIT_MAX || 200),
  DB_CONNECT_RETRIES: Number(process.env.DB_CONNECT_RETRIES || 30),
  DB_CONNECT_RETRY_DELAY_MS: Number(process.env.DB_CONNECT_RETRY_DELAY_MS || 2000),
  DB_HEALTHCHECK_TIMEOUT_MS: Number(process.env.DB_HEALTHCHECK_TIMEOUT_MS || 3000),
  DB_WATCHDOG_INTERVAL_MS: Number(process.env.DB_WATCHDOG_INTERVAL_MS || 30000),
  DB_WATCHDOG_FAILURE_THRESHOLD: Number(process.env.DB_WATCHDOG_FAILURE_THRESHOLD || 3),
  // 认证令牌中角色/部门等信息的回查缓存时长，避免每个请求都查库
  AUTH_USER_CACHE_TTL_MS: Number(process.env.AUTH_USER_CACHE_TTL_MS || 30000),
};
