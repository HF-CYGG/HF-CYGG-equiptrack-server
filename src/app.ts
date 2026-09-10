import express from "express";
import compression from "compression";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import path from "path";
import { env } from "./config/env";
import { errorHandler, notFound } from "./middlewares/error";
import { authGuard } from "./middlewares/auth";
import api from "./routes/api";
import { getDatabaseHealth } from "./health";
// import { initStore } from "./utils/store";

const app = express();

app.disable("x-powered-by");
// 部署在 Nginx/CDN 之后时，req.ip 默认拿到的是反向代理地址，
// 会让所有用户落进同一个限流桶：攻击者发几个请求就能让全站被限流。
// 这里声明信任的代理层数，请按实际部署链路调整。
app.set("trust proxy", Number(process.env.TRUST_PROXY_HOPS || 1));
// 安全头设置
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
// GZIP 压缩
app.use(compression());
// CORS 跨域设置
const corsOriginOption =
  env.CORS_ORIGIN.trim() === "*"
    ? "*"
    : env.CORS_ORIGIN.split(",").map(s => s.trim()).filter(Boolean);

app.use(cors({
  origin: corsOriginOption,
  credentials: false,
  allowedHeaders: ["Content-Type", "Authorization"],
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"]
}));
// 全局速率限制
app.use(
  rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
  })
);
// 请求体解析
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

// 静态文件服务
const staticHeaders = (res: any) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
};

// 借还凭证照片与头像需要登录后才能访问。
// 此前这两个目录对公网完全开放，且带一年不可变缓存，URL 一旦从接口响应中
// 外泄就再也收不回来。
app.use("/uploads", authGuard, express.static(path.join(process.cwd(), "uploads"), { setHeaders: staticHeaders }));
app.use("/avatars", authGuard, express.static(path.join(process.cwd(), "data", "avatars"), { setHeaders: staticHeaders }));

// 根路由 (健康检查/欢迎页)
app.get("/", (_req, res) => {
  res.status(200).send("EquipTrack Server Running");
});

// 健康检查接口
app.get("/health/live", (_req, res) => {
  res.status(200).json({ status: "ok", env: env.NODE_ENV });
});

app.get("/health", async (_req, res) => {
  const database = await getDatabaseHealth();
  const isHealthy = database.ready;

  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? "ok" : "unhealthy",
    env: env.NODE_ENV,
    database: database.database,
    // 数据库错误原文会带出内网网段、容器 IP 与数据库账号名，
    // 生产环境不对匿名访问者返回
    ...(database.error && env.NODE_ENV !== "production" ? { error: database.error } : {}),
  });
});

// 文档占位符
app.get("/docs", (_req, res) => {
  res.status(200).send("EquipTrack API docs are available in API_SPEC.md and docs/ directory.");
});

app.get(["/favicon.ico", "/sitemap.xml", "/security.txt"], (_req, res) => {
  res.status(204).end();
});

// API 路由挂载
app.use("/api", api);

// 错误处理 (404 和 全局错误)
app.use(notFound);
app.use(errorHandler);

export { app };
