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
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;
UPDATE users
SET organization_id = (SELECT id FROM organizations WHERE slug = 'default')
WHERE organization_id IS NULL;
ALTER TABLE users ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_organization_id_fkey;
ALTER TABLE users ADD CONSTRAINT users_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_users_organization_role ON users (organization_id, role);

CREATE TABLE IF NOT EXISTS dispatch_operators (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, display_name)
);

INSERT INTO dispatch_operators (organization_id, display_name)
SELECT organization.id, dispatcher_name
FROM organizations organization
CROSS JOIN (VALUES ('Vibha'), ('Suraj'), ('Ramesh'), ('Anjali'), ('Subhdip'), ('Princy'), ('Sujaya'), ('Naveen')) AS seed(dispatcher_name)
ON CONFLICT (organization_id, display_name) DO NOTHING;

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
ALTER TABLE runner_tasks ADD COLUMN IF NOT EXISTS destination_lat DOUBLE PRECISION;
ALTER TABLE runner_tasks ADD COLUMN IF NOT EXISTS destination_lon DOUBLE PRECISION;
ALTER TABLE runner_tasks ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal','high','urgent'));
ALTER TABLE runner_tasks DROP CONSTRAINT IF EXISTS runner_tasks_priority_check;
UPDATE runner_tasks SET priority = 'normal' WHERE priority = 'low';
ALTER TABLE runner_tasks ADD CONSTRAINT runner_tasks_priority_check CHECK (priority IN ('normal','high','urgent'));
ALTER TABLE runner_tasks ADD COLUMN IF NOT EXISTS due_at TIMESTAMPTZ;
ALTER TABLE runner_tasks ADD COLUMN IF NOT EXISTS incomplete_reason TEXT;
ALTER TABLE runner_tasks ADD COLUMN IF NOT EXISTS incomplete_note TEXT;
ALTER TABLE runner_tasks ADD COLUMN IF NOT EXISTS created_by_operator_id INTEGER REFERENCES dispatch_operators(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_runner_tasks_created_by_operator ON runner_tasks (created_by_operator_id, created_at DESC);
-- Tasks can be prepared before a runner is chosen. They remain in the shared
-- dispatch queue with status 'unassigned' until a dispatcher assigns them.
ALTER TABLE runner_tasks ALTER COLUMN runner_id DROP NOT NULL;
ALTER TABLE runner_tasks DROP CONSTRAINT IF EXISTS runner_tasks_status_check;
ALTER TABLE runner_tasks ADD CONSTRAINT runner_tasks_status_check
  CHECK (status IN ('unassigned', 'sent', 'acknowledged', 'in_progress', 'completed', 'unable_to_complete'));

CREATE TABLE IF NOT EXISTS task_events (
  id BIGSERIAL PRIMARY KEY, organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  task_id BIGINT NOT NULL REFERENCES runner_tasks(id) ON DELETE CASCADE, actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL, occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(), metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_task_events_task_time ON task_events (task_id, occurred_at);

CREATE TABLE IF NOT EXISTS runner_shifts (
  id BIGSERIAL PRIMARY KEY, organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  runner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT, started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ, status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','ended'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_runner_active_shift ON runner_shifts(runner_id) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS runner_task_documents (
  id BIGSERIAL PRIMARY KEY,
  task_id BIGINT NOT NULL REFERENCES runner_tasks(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  collected BOOLEAN NOT NULL DEFAULT false,
  collected_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS runner_task_attachments (
  id BIGSERIAL PRIMARY KEY,
  task_id BIGINT NOT NULL REFERENCES runner_tasks(id) ON DELETE CASCADE,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_task_attachments_task ON runner_task_attachments(task_id, created_at DESC);

CREATE TABLE IF NOT EXISTS task_assignment_requests (
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  dispatcher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  task_id BIGINT REFERENCES runner_tasks(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, dispatcher_id, idempotency_key)
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
