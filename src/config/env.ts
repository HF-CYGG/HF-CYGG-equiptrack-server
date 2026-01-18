const nodeEnv = process.env.NODE_ENV || "development";

export const env = {
  NODE_ENV: nodeEnv,
  PORT: Number(process.env.PORT || 3000),
  JWT_SECRET: process.env.JWT_SECRET || "equiptrack-dev-secret",
  CORS_ORIGIN: process.env.CORS_ORIGIN || "*",
  RATE_LIMIT_WINDOW_MS: Number(process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  RATE_LIMIT_MAX: Number(process.env.RATE_LIMIT_MAX || 200),
  ALLOW_PLAINTEXT_PASSWORDS:
    String(process.env.ALLOW_PLAINTEXT_PASSWORDS ?? (nodeEnv === "production" ? "true" : ""))
      .toLowerCase() === "true",
};

// Security Check
if (env.NODE_ENV === "production") {
  if (env.JWT_SECRET === "equiptrack-dev-secret") {
    console.warn("SECURITY WARNING: Using default JWT_SECRET in production.");
  }
  if (env.JWT_SECRET.length < 16) {
    console.warn("SECURITY WARNING: JWT_SECRET is short in production (recommended >= 32 chars).");
  }

  if (!env.CORS_ORIGIN) {
    console.warn("SECURITY WARNING: CORS_ORIGIN is not set in production.");
  }

  if (env.ALLOW_PLAINTEXT_PASSWORDS) {
    console.warn("SECURITY WARNING: Plaintext passwords are enabled in production.");
  }
}
