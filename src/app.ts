import express from "express";
import compression from "compression";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import path from "path";
import { env } from "./config/env";
import { errorHandler, notFound } from "./middlewares/error";
import api from "./routes/api";
// import { initStore } from "./utils/store";

const app = express();

app.disable("x-powered-by");
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

app.use("/uploads", express.static(path.join(process.cwd(), "uploads"), { setHeaders: staticHeaders }));
app.use("/avatars", express.static(path.join(process.cwd(), "data", "avatars"), { setHeaders: staticHeaders }));

// 根路由 (健康检查/欢迎页)
app.get("/", (_req, res) => {
  res.status(200).send("EquipTrack Server Running");
});

// 健康检查接口
app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok", env: env.NODE_ENV });
});

// 文档占位符
app.get("/docs", (_req, res) => {
  res.status(200).send("EquipTrack API docs are available in API_SPEC.md and docs/ directory.");
});

// API 路由挂载
app.use("/api", api);

// 错误处理 (404 和 全局错误)
app.use(notFound);
app.use(errorHandler);

export { app };
