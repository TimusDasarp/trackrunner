import { pool } from "./pool";

const SQL = `
CREATE TABLE IF NOT EXISTS organizations (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  slug        TEXT UNIQUE NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

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
  event_id    TEXT,
  ts          BIGINT NOT NULL,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_location_history_runner_ts
  ON location_history (runner_id, ts DESC);

ALTER TABLE location_history ADD COLUMN IF NOT EXISTS event_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_location_history_runner_event
  ON location_history (runner_id, event_id)
  WHERE event_id IS NOT NULL;

INSERT INTO organizations (name, slug)
VALUES ('Default organization', 'default')
ON CONFLICT (slug) DO NOTHING;

ALTER TABLE users ADD COLUMN IF NOT EXISTS organization_id INTEGER;
UPDATE users
SET organization_id = (SELECT id FROM organizations WHERE slug = 'default')
WHERE organization_id IS NULL;
ALTER TABLE users ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_organization_id_fkey;
ALTER TABLE users ADD CONSTRAINT users_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_users_organization_role ON users (organization_id, role);

CREATE TABLE IF NOT EXISTS runner_assignments (
  dispatcher_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  runner_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  active          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (dispatcher_id, runner_id),
  CHECK (dispatcher_id <> runner_id)
);
CREATE INDEX IF NOT EXISTS idx_runner_assignments_dispatcher_active
  ON runner_assignments (dispatcher_id, active, runner_id);
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
