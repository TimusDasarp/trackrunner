import { pool } from "./pool";

const SQL = `
CREATE TABLE IF NOT EXISTS users (
  id           SERIAL PRIMARY KEY,
  email        TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role         TEXT NOT NULL CHECK (role IN ('runner','dispatcher')),
  display_name TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS location_history (
  id          BIGSERIAL PRIMARY KEY,
  runner_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lat         DOUBLE PRECISION NOT NULL,
  lon         DOUBLE PRECISION NOT NULL,
  accuracy    REAL,
  speed       REAL,
  bearing     REAL,
  altitude    REAL,
  battery     REAL,
  ts          BIGINT NOT NULL,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_location_history_runner_ts
  ON location_history (runner_id, ts DESC);
`;

async function main() {
  // eslint-disable-next-line no-console
  console.log("[migrate] running schema...");
  await pool.query(SQL);
  // eslint-disable-next-line no-console
  console.log("[migrate] done.");
  await pool.end();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[migrate] failed:", err);
  process.exit(1);
});
