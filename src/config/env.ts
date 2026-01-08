export const env = {
  NODE_ENV: process.env.NODE_ENV || "production",
  PORT: Number(process.env.PORT || 3000),
  JWT_SECRET: process.env.JWT_SECRET || "equiptrack-dev-secret",
  CORS_ORIGIN: process.env.CORS_ORIGIN || "*",
  RATE_LIMIT_WINDOW_MS: Number(process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  RATE_LIMIT_MAX: Number(process.env.RATE_LIMIT_MAX || 200),
};

// Security Check
if (env.NODE_ENV === "production" && env.JWT_SECRET === "equiptrack-dev-secret") {
  console.error("CRITICAL SECURITY WARNING: You are using the default JWT_SECRET in production.");
  console.error("Please set JWT_SECRET in your .env file.");
  // Uncommenting the next line is recommended to force a fix
  // process.exit(1); 
}