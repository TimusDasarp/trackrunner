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

CREATE TABLE IF NOT EXISTS document_types (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

INSERT INTO document_types (organization_id, name)
SELECT id, document_name FROM organizations
CROSS JOIN (VALUES ('Cheque'), ('Account Opening Form'), ('Modification Form'), ('DIS Slip')) AS defaults(document_name)
ON CONFLICT (organization_id, name) DO NOTHING;

CREATE TABLE IF NOT EXISTS runner_tasks (
  id BIGSERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  dispatcher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  runner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  client_name TEXT NOT NULL,
  client_address TEXT NOT NULL,
  client_phone TEXT NOT NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'acknowledged', 'in_progress', 'completed', 'unable_to_complete')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  acknowledged_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_runner_tasks_runner_status ON runner_tasks (runner_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS runner_task_documents (
  id BIGSERIAL PRIMARY KEY,
  task_id BIGINT NOT NULL REFERENCES runner_tasks(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  collected BOOLEAN NOT NULL DEFAULT false,
  collected_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS runner_push_devices (
  id BIGSERIAL PRIMARY KEY,
  runner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  platform TEXT NOT NULL CHECK (platform IN ('android', 'ios')),
  app_version TEXT,
  permission_granted BOOLEAN NOT NULL DEFAULT true,
  active BOOLEAN NOT NULL DEFAULT true,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_runner_push_devices_active ON runner_push_devices (runner_id) WHERE active = true;
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
