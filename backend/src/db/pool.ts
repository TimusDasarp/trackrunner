import { Pool } from "pg";
import { config } from "../config";

export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 10,
});

pool.on("error", (err) => {
  // Don't crash the process on transient pool errors; log and let queries retry.
  // eslint-disable-next-line no-console
  console.error("[pg] pool error:", err.message);
});
