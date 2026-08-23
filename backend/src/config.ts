import dotenv from "dotenv";
dotenv.config();

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function positiveInteger(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

function parseOrigins(value: string): string[] {
  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

const nodeEnv = process.env.NODE_ENV ?? "development";
const isProduction = nodeEnv === "production";
const jwtSecret = required(
  "JWT_SECRET",
  isProduction ? undefined : "dev-secret-change-me"
);
const corsOrigins = parseOrigins(
  process.env.CORS_ORIGINS ??
    (isProduction ? "" : "http://localhost:5173,http://127.0.0.1:5173")
);

if (isProduction && jwtSecret.length < 32) {
  throw new Error("JWT_SECRET must be at least 32 characters in production");
}

if (isProduction && corsOrigins.length === 0) {
  throw new Error("CORS_ORIGINS must contain at least one allowed origin in production");
}

export const config = {
  port: positiveInteger("PORT", 3000),
  nodeEnv,
  isProduction,
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
  redisUrl: required("REDIS_URL", "redis://localhost:6379"),
  databaseUrl: required(
    "DATABASE_URL",
    "postgres://trackrunner:trackrunner@localhost:5432/trackrunner"
  ),
  flushIntervalMs: positiveInteger("FLUSH_INTERVAL_MS", 10_000),
  firebaseServiceAccountPath: process.env.FIREBASE_SERVICE_ACCOUNT_PATH,
  firebaseServiceAccountJson: process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  supabaseStorageBucket: process.env.SUPABASE_STORAGE_BUCKET ?? "task-documents",
  corsOrigins,
  trustProxy: process.env.TRUST_PROXY === "true",
};
