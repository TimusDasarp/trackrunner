import dotenv from "dotenv";
dotenv.config();

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  nodeEnv: process.env.NODE_ENV ?? "development",
  jwtSecret: required("JWT_SECRET", "dev-secret-change-me"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
  redisUrl: required("REDIS_URL", "redis://localhost:6379"),
  databaseUrl: required(
    "DATABASE_URL",
    "postgres://trackrunner:trackrunner@localhost:5432/trackrunner"
  ),
  flushIntervalMs: Number(process.env.FLUSH_INTERVAL_MS ?? 10_000),
};
