import express from "express";
import compression from "compression";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import path from "path";
import { env } from "./config/env";
import { errorHandler, notFound } from "./middlewares/error";
import api from "./routes/api";
import { initStore } from "./utils/store";

const app = express();

app.disable("x-powered-by");
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(compression());
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
app.use(
  rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
  })
);
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));
app.use("/avatars", express.static(path.join(process.cwd(), "data", "avatars")));

// Health check
app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok", env: env.NODE_ENV });
});

// Docs placeholder
app.get("/docs", (_req, res) => {
  res.status(200).send("EquipTrack API docs are available in API_SPEC.md and docs/ directory.");
});

// Ensure data store initialized
initStore().catch(() => {});

// API router
app.use("/api", api);

// Fallbacks
app.use(notFound);
app.use(errorHandler);

export { app };