import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { pool } from "../db/pool";
import { config } from "../config";
import { sendTaskAssignmentPush } from "../services/pushNotifications";
import {
  clearRunnerLocationData,
  getAllRunnerStates,
  getOnlineRunners,
} from "../services/locationStore";

export const apiRouter = Router();

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const CreateRunnerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  displayName: z.string().trim().min(2).max(80),
});

const UpdateRunnerSchema = z.object({
  displayName: z.string().trim().min(2).max(80),
});

const IndianMobileSchema = z.string().trim().transform((value) => value.replace(/[\s-]/g, "")).refine(
  (value) => /^(?:\+91|91)?[6-9]\d{9}$/.test(value),
  "clientPhone must be a valid Indian mobile number"
).transform((value) => `+91${value.replace(/^(?:\+91|91)/, "")}`);

const CreateTaskSchema = z.object({
  clientName: z.string().trim().min(2).max(120),
  clientAddress: z.string().trim().min(5).max(500),
  clientPhone: IndianMobileSchema,
  notes: z.string().trim().max(1000).optional(),
  documents: z.array(z.string().trim().min(1).max(120)).min(1).max(30),
  destinationLat: z.number().min(-90).max(90).optional(),
  destinationLon: z.number().min(-180).max(180).optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  dueAt: z.string().datetime().optional(),
}).refine((value) => (value.destinationLat == null) === (value.destinationLon == null), {
  message: "destination coordinates must be provided together",
});

const UpdateTaskSchema = z.object({
  status: z.enum(["sent", "acknowledged", "in_progress", "completed", "unable_to_complete"]),
  documents: z.array(z.object({ id: z.union([z.string(), z.number()]), collected: z.boolean() })).max(30).optional(),
});

const DispatcherTaskUpdateSchema = CreateTaskSchema;

const PushDeviceSchema = z.object({
  token: z.string().trim().min(20).max(4096),
  platform: z.enum(["android", "ios"]),
  appVersion: z.string().trim().min(1).max(80).optional(),
  permissionGranted: z.boolean().default(true),
});

apiRouter.post("/auth/login", async (req, res) => {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid body" });

  const { email, password } = parsed.data;
  const { rows } = await pool.query(
    "SELECT id, email, password_hash, role, display_name, organization_id FROM users WHERE email = $1",
    [email]
  );
  if (rows.length === 0) return res.status(401).json({ error: "invalid credentials" });

  const user = rows[0];
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: "invalid credentials" });

  const token = jwt.sign(
    { sub: String(user.id), role: user.role, email: user.email, organizationId: String(user.organization_id) },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn as any }
  );

  res.json({
    token,
    user: {
      id: String(user.id),
      email: user.email,
      role: user.role,
      displayName: user.display_name,
      organizationId: String(user.organization_id),
    },
  });
});

apiRouter.get("/health", async (_req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

// --- Dispatcher-only endpoints (auth checked via JWT in header) ---
function requireDispatcher(req: any, res: any, next: any) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return res.status(401).json({ error: "missing token" });
  try {
    const claims: any = jwt.verify(auth.slice(7), config.jwtSecret);
    if (claims.role !== "dispatcher" || !claims.organizationId) {
      return res.status(403).json({ error: "forbidden" });
    }
    req.user = claims;
    next();
  } catch {
    res.status(401).json({ error: "invalid token" });
  }
}

function requireUser(req: any, res: any, next: any) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return res.status(401).json({ error: "missing token" });
  try { req.user = jwt.verify(auth.slice(7), config.jwtSecret); next(); }
  catch { res.status(401).json({ error: "invalid token" }); }
}

function taskDto(row: any) {
  return {
    id: String(row.id), runnerId: String(row.runner_id), clientName: row.client_name,
    clientAddress: row.client_address, clientPhone: row.client_phone, notes: row.notes,
    status: row.status, destinationLat: row.destination_lat, destinationLon: row.destination_lon, createdAt: row.created_at, acknowledgedAt: row.acknowledged_at,
    startedAt: row.started_at, completedAt: row.completed_at, priority: row.priority, dueAt: row.due_at,
  };
}

async function recordTaskEvent(organizationId: string, taskId: string, actorId: string, eventType: string, metadata: Record<string, unknown> = {}) {
  await pool.query("INSERT INTO task_events (organization_id, task_id, actor_id, event_type, metadata) VALUES ($1,$2,$3,$4,$5)", [organizationId, taskId, actorId, eventType, JSON.stringify(metadata)]);
}

apiRouter.put("/devices/push-token", requireUser, async (req: any, res) => {
  if (req.user.role !== "runner") return res.status(403).json({ error: "forbidden" });
  const parsed = PushDeviceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid push device" });
  const device = parsed.data;
  await pool.query(
    `INSERT INTO runner_push_devices (runner_id, token, platform, app_version, permission_granted, active)
     VALUES ($1, $2, $3, $4, $5, $5)
     ON CONFLICT (token) DO UPDATE SET runner_id = EXCLUDED.runner_id, platform = EXCLUDED.platform,
       app_version = EXCLUDED.app_version, permission_granted = EXCLUDED.permission_granted,
       active = EXCLUDED.active, last_seen_at = now(), updated_at = now()`,
    [req.user.sub, device.token, device.platform, device.appVersion ?? null, device.permissionGranted]
  );
  console.log(`[push] registered device runner=${req.user.sub} platform=${device.platform}`);
  res.json({ ok: true });
});

apiRouter.delete("/devices/push-token", requireUser, async (req: any, res) => {
  const token = typeof req.body?.token === "string" ? req.body.token : null;
  if (!token) return res.status(400).json({ error: "invalid push device" });
  await pool.query("UPDATE runner_push_devices SET active = false, updated_at = now() WHERE runner_id = $1 AND token = $2", [req.user.sub, token]);
  res.json({ ok: true });
});

async function getTask(taskId: string, organizationId: string) {
  const { rows } = await pool.query(`SELECT * FROM runner_tasks WHERE id = $1 AND organization_id = $2`, [taskId, organizationId]);
  if (!rows[0]) return null;
  const { rows: documents } = await pool.query(`SELECT id, name, collected, collected_at FROM runner_task_documents WHERE task_id = $1 ORDER BY id`, [taskId]);
  return { ...taskDto(rows[0]), documents: documents.map((d) => ({ id: String(d.id), name: d.name, collected: d.collected, collectedAt: d.collected_at })) };
}

apiRouter.get("/runners", requireDispatcher, async (_req: any, res) => {
  const includeArchived = _req.query.includeArchived === "true";
  const { rows: assignments } = await pool.query(
    `SELECT runner.id, runner.display_name, runner.email
           , assignment.active
     FROM runner_assignments assignment
     JOIN users runner ON runner.id = assignment.runner_id
     WHERE assignment.dispatcher_id = $1
       AND assignment.organization_id = $2
       ${includeArchived ? "" : "AND assignment.active = true"}
     ORDER BY assignment.active DESC, runner.display_name ASC`,
    [_req.user.sub, _req.user.organizationId]
  );
  const assignedRunners = new Map(
    assignments.map((runner) => [String(runner.id), runner])
  );
  const states = await getAllRunnerStates();
  const online = new Set(await getOnlineRunners());
  const now = Date.now();
  const freshnessWindowMs = 90_000;
  const runners = [...assignedRunners.entries()].map(([runnerId, runner]) => {
    const state: any = states[runnerId];
    if (!state || String(state.organizationId) !== String(_req.user.organizationId)) {
      return {
        runnerId, displayName: runner.display_name, email: runner.email,
        assignmentActive: runner.active,
        online: online.has(runnerId), trackingActive: false, status: online.has(runnerId) ? "idle" : "offline",
        hasLocation: false,
      };
    }
    const trackingActive = state.trackingActive === "true";
    const fresh = Number.isFinite(Number(state.ts)) && now - Number(state.ts) <= freshnessWindowMs;
    const status = trackingActive ? (fresh ? "live" : "stale") : (online.has(runnerId) ? "idle" : "offline");
    return {
      runnerId,
      displayName: runner.display_name,
      email: runner.email,
      assignmentActive: runner.active,
      lat: Number(state.lat),
      lon: Number(state.lon),
      accuracy: state.accuracy ? Number(state.accuracy) : null,
      speed: state.speed ? Number(state.speed) : null,
      bearing: state.bearing ? Number(state.bearing) : null,
      battery: state.battery ? Number(state.battery) : null,
      ts: Number(state.ts),
      online: online.has(runnerId),
      trackingActive,
      status,
      hasLocation: true,
    };
  });
  res.json({ runners });
});

// Create an account and assign it to the signed-in dispatcher. This deliberately
// has no public registration route: dispatchers control who can report locations.
apiRouter.post("/runners", requireDispatcher, async (req: any, res) => {
  const parsed = CreateRunnerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid runner details" });

  const { email, password, displayName } = parsed.data;
  const passwordHash = await bcrypt.hash(password, 10);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `INSERT INTO users (email, password_hash, role, display_name, organization_id)
       VALUES ($1, $2, 'runner', $3, $4)
       RETURNING id, email, display_name`,
      [email.toLowerCase(), passwordHash, displayName, req.user.organizationId]
    );
    const runner = rows[0];
    await client.query(
      `INSERT INTO runner_assignments (dispatcher_id, runner_id, organization_id)
       VALUES ($1, $2, $3)`,
      [req.user.sub, runner.id, req.user.organizationId]
    );
    await client.query("COMMIT");
    res.status(201).json({
      runner: { runnerId: String(runner.id), displayName: runner.display_name, email: runner.email },
    });
  } catch (error: any) {
    await client.query("ROLLBACK");
    if (error?.code === "23505") return res.status(409).json({ error: "an account with this email already exists" });
    console.error("Failed to create runner:", error);
    return res.status(500).json({ error: "could not create runner" });
  } finally {
    client.release();
  }
});

apiRouter.patch("/runners/:id", requireDispatcher, async (req: any, res) => {
  const parsed = UpdateRunnerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid runner details" });

  const { rows } = await pool.query(
    `UPDATE users runner
     SET display_name = $1
     FROM runner_assignments assignment
     WHERE runner.id = $2
       AND assignment.runner_id = runner.id
       AND assignment.dispatcher_id = $3
       AND assignment.organization_id = $4
       AND assignment.active = true
     RETURNING runner.id, runner.email, runner.display_name`,
    [parsed.data.displayName, req.params.id, req.user.sub, req.user.organizationId]
  );
  if (rows.length === 0) return res.status(404).json({ error: "runner not found" });
  const runner = rows[0];
  res.json({ runner: { runnerId: String(runner.id), displayName: runner.display_name, email: runner.email } });
});

// Clear location data without deleting the runner's account or assignment.
apiRouter.delete("/runners/:id/location-data", requireDispatcher, async (req: any, res) => {
  const runnerId = String(req.params.id);
  const { rows: assignments } = await pool.query(
    `SELECT 1 FROM runner_assignments
     WHERE runner_id = $1 AND dispatcher_id = $2 AND organization_id = $3 AND active = true`,
    [runnerId, req.user.sub, req.user.organizationId]
  );
  if (assignments.length === 0) return res.status(404).json({ error: "runner not found" });

  const deletedHistoryCount = await clearRunnerLocationData(runnerId);
  res.json({ ok: true, runnerId, deletedHistoryCount });
});

apiRouter.get("/runners/:id/history", requireDispatcher, async (req: any, res) => {
  const id = req.params.id;
  const limit = Math.min(Number(req.query.limit ?? 500), 5000);
  const { rows } = await pool.query(
    `SELECT h.lat, h.lon, h.accuracy, h.speed, h.bearing, h.altitude, h.battery, h.ts
     FROM location_history h
     JOIN users runner ON runner.id = h.runner_id
     JOIN runner_assignments assignment
       ON assignment.runner_id = runner.id
      AND assignment.dispatcher_id = $3
      AND assignment.organization_id = runner.organization_id
      AND assignment.active = true
     WHERE h.runner_id = $1 AND runner.organization_id = $2
     ORDER BY ts DESC
     LIMIT $4`,
    [id, req.user.organizationId, req.user.sub, limit]
  );
  res.json({ runnerId: id, points: rows.reverse() });
});

// Archive a runner from this dispatcher's workspace without deleting their
// task/location history. The assignment can be restored later.
apiRouter.delete("/runners/:id", requireDispatcher, async (req: any, res) => {
  const { rows } = await pool.query(
    `UPDATE runner_assignments SET active = false
     WHERE runner_id = $1 AND dispatcher_id = $2 AND organization_id = $3 AND active = true
     RETURNING runner_id`,
    [req.params.id, req.user.sub, req.user.organizationId]
  );
  if (!rows[0]) return res.status(404).json({ error: "active runner not found" });
  res.json({ ok: true, runnerId: String(rows[0].runner_id) });
});

apiRouter.post("/runners/:id/restore", requireDispatcher, async (req: any, res) => {
  const { rows } = await pool.query(
    `UPDATE runner_assignments SET active = true
     WHERE runner_id = $1 AND dispatcher_id = $2 AND organization_id = $3 AND active = false
     RETURNING runner_id`,
    [req.params.id, req.user.sub, req.user.organizationId]
  );
  if (!rows[0]) return res.status(404).json({ error: "archived runner not found" });
  res.json({ ok: true, runnerId: String(rows[0].runner_id) });
});

apiRouter.get("/document-types", requireDispatcher, async (req: any, res) => {
  const { rows } = await pool.query(`SELECT id, name FROM document_types WHERE organization_id = $1 AND active = true ORDER BY name`, [req.user.organizationId]);
  res.json({ documentTypes: rows.map((row) => ({ id: String(row.id), name: row.name })) });
});

apiRouter.get("/runners/:id/tasks", requireDispatcher, async (req: any, res) => {
  const runnerId = String(req.params.id);
  const { rows: assignment } = await pool.query(`SELECT 1 FROM runner_assignments WHERE runner_id = $1 AND dispatcher_id = $2 AND organization_id = $3 AND active = true`, [runnerId, req.user.sub, req.user.organizationId]);
  if (!assignment[0]) return res.status(404).json({ error: "runner not found" });
  const { rows } = await pool.query(`SELECT * FROM runner_tasks WHERE organization_id = $1 AND runner_id = $2 AND status NOT IN ('completed', 'unable_to_complete') ORDER BY created_at DESC`, [req.user.organizationId, runnerId]);
  const tasks = await Promise.all(rows.map((row) => getTask(String(row.id), String(req.user.organizationId))));
  res.json({ tasks });
});

apiRouter.post("/runners/:id/tasks", requireDispatcher, async (req: any, res) => {
  const parsed = CreateTaskSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid task details" });
  const runnerId = String(req.params.id);
  const { rows: assignment } = await pool.query(`SELECT 1 FROM runner_assignments WHERE runner_id = $1 AND dispatcher_id = $2 AND organization_id = $3 AND active = true`, [runnerId, req.user.sub, req.user.organizationId]);
  if (!assignment[0]) return res.status(404).json({ error: "runner not found" });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(`INSERT INTO runner_tasks (organization_id, dispatcher_id, runner_id, client_name, client_address, client_phone, notes, destination_lat, destination_lon, priority, due_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`, [req.user.organizationId, req.user.sub, runnerId, parsed.data.clientName, parsed.data.clientAddress, parsed.data.clientPhone, parsed.data.notes || null, parsed.data.destinationLat ?? null, parsed.data.destinationLon ?? null, parsed.data.priority, parsed.data.dueAt ?? null]);
    for (const document of [...new Set(parsed.data.documents)]) await client.query(`INSERT INTO runner_task_documents (task_id, name) VALUES ($1, $2)`, [rows[0].id, document]);
    await client.query("COMMIT");
    await recordTaskEvent(req.user.organizationId, String(rows[0].id), req.user.sub, "created", { priority: parsed.data.priority, dueAt: parsed.data.dueAt ?? null });
    const task = await getTask(String(rows[0].id), String(req.user.organizationId));
    req.app.get("io").to(`runner:${runnerId}`).emit("task:created", task);
    req.app.get("io").to(`dispatchers:${req.user.organizationId}:runner:${runnerId}`).emit("task:created", task);
    const { rows: devices } = await pool.query(
      "SELECT token FROM runner_push_devices WHERE runner_id = $1 AND active = true AND permission_granted = true",
      [runnerId]
    );
    console.log(`[push] task assignment task=${task?.id} runner=${runnerId} devices=${devices.length}`);
    void sendTaskAssignmentPush(devices.map((device) => device.token), task!).then(async (invalidTokens) => {
      console.log(`[push] task assignment result task=${task?.id} invalid=${invalidTokens.length}`);
      if (invalidTokens.length > 0) {
        await pool.query("UPDATE runner_push_devices SET active = false, updated_at = now() WHERE token = ANY($1)", [invalidTokens]);
      }
    }).catch((pushError) => console.error("Failed to send task-assignment push", pushError));
    res.status(201).json({ task });
  } catch (error) { await client.query("ROLLBACK"); console.error("Failed to create task", error); res.status(500).json({ error: "could not create task" }); }
  finally { client.release(); }
});

apiRouter.get("/tasks", requireUser, async (req: any, res) => {
  const scope = req.query.scope === "completed" ? "completed" : "active";
  const runnerFilter = req.user.role === "runner" ? "AND runner_id = $2" : "AND dispatcher_id = $2";
  const statusFilter = scope === "completed"
    ? "AND status IN ('completed', 'unable_to_complete')"
    : "AND status NOT IN ('completed', 'unable_to_complete')";
  const { rows } = await pool.query(`SELECT * FROM runner_tasks WHERE organization_id = $1 ${runnerFilter} ${statusFilter} ORDER BY COALESCE(completed_at, created_at) DESC`, [req.user.organizationId, req.user.sub]);
  const tasks = await Promise.all(rows.map((row) => getTask(String(row.id), String(req.user.organizationId))));
  res.json({ tasks });
});

apiRouter.patch("/tasks/:id", requireUser, async (req: any, res) => {
  if (req.user.role === "dispatcher") {
    const parsed = DispatcherTaskUpdateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "invalid task update" });
    const { rows } = await pool.query(
      `UPDATE runner_tasks SET client_name = $1, client_address = $2, client_phone = $3, notes = $4,
       destination_lat = $5, destination_lon = $6, priority = $7, due_at = $8
       WHERE id = $9 AND organization_id = $10 AND dispatcher_id = $11 AND status = 'sent'
       RETURNING id`,
      [parsed.data.clientName, parsed.data.clientAddress, parsed.data.clientPhone, parsed.data.notes || null,
        parsed.data.destinationLat ?? null, parsed.data.destinationLon ?? null, parsed.data.priority, parsed.data.dueAt ?? null, req.params.id,
        req.user.organizationId, req.user.sub]
    );
    if (!rows[0]) return res.status(409).json({ error: "only unacknowledged tasks can be edited" });
    await pool.query("DELETE FROM runner_task_documents WHERE task_id = $1", [req.params.id]);
    for (const document of [...new Set(parsed.data.documents)]) {
      await pool.query("INSERT INTO runner_task_documents (task_id, name) VALUES ($1, $2)", [req.params.id, document]);
    }
    const updated = await getTask(String(req.params.id), String(req.user.organizationId));
    await recordTaskEvent(req.user.organizationId, String(req.params.id), req.user.sub, "edited");
    req.app.get("io").to(`runner:${updated!.runnerId}`).emit("task:updated", updated);
    req.app.get("io").to(`dispatchers:${req.user.organizationId}:runner:${updated!.runnerId}`).emit("task:updated", updated);
    return res.json({ task: updated });
  }
  if (req.user.role !== "runner") return res.status(403).json({ error: "forbidden" });
  const parsed = UpdateTaskSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid task update" });
  const task = await getTask(String(req.params.id), String(req.user.organizationId));
  if (!task || task.runnerId !== String(req.user.sub)) return res.status(404).json({ error: "task not found" });
  const timeField = parsed.data.status === "acknowledged" ? "acknowledged_at" : parsed.data.status === "in_progress" ? "started_at" : (parsed.data.status === "completed" || parsed.data.status === "unable_to_complete") ? "completed_at" : null;
  await pool.query(`UPDATE runner_tasks SET status = $1${timeField ? `, ${timeField} = COALESCE(${timeField}, now())` : ""} WHERE id = $2`, [parsed.data.status, task.id]);
  for (const doc of parsed.data.documents ?? []) await pool.query(`UPDATE runner_task_documents SET collected = $1, collected_at = CASE WHEN $1 THEN COALESCE(collected_at, now()) ELSE NULL END WHERE id = $2 AND task_id = $3`, [doc.collected, doc.id, task.id]);
  const updated = await getTask(task.id, String(req.user.organizationId));
  await recordTaskEvent(req.user.organizationId, task.id, String(req.user.sub), parsed.data.status);
  req.app.get("io").to(`runner:${task.runnerId}`).emit("task:updated", updated);
  req.app.get("io").to(`dispatchers:${req.user.organizationId}:runner:${task.runnerId}`).emit("task:updated", updated);
  res.json({ task: updated });
});

apiRouter.get("/analytics/overview", requireDispatcher, async (req: any, res) => {
  const days = Math.min(Math.max(Number(req.query.days ?? 7), 1), 90);
  const runnerId = req.query.runnerId ? String(req.query.runnerId) : null;
  const params: any[] = [req.user.organizationId, req.user.sub, days];
  const filter = runnerId ? "AND t.runner_id = $4" : "";
  if (runnerId) params.push(runnerId);
  const joins = `FROM runner_tasks t JOIN runner_assignments a ON a.runner_id=t.runner_id AND a.dispatcher_id=$2 AND a.organization_id=t.organization_id`;
  const where = `WHERE t.organization_id=$1 AND t.created_at >= now() - ($3::text || ' days')::interval ${filter}`;
  const { rows: totals } = await pool.query(`SELECT count(*)::int assigned, count(*) FILTER (WHERE t.status='completed')::int completed, count(*) FILTER (WHERE t.status='unable_to_complete')::int unable, count(*) FILTER (WHERE t.due_at < now() AND t.status NOT IN ('completed','unable_to_complete'))::int overdue, percentile_cont(.5) WITHIN GROUP (ORDER BY extract(epoch FROM t.acknowledged_at-t.created_at)) FILTER (WHERE t.acknowledged_at IS NOT NULL) median_ack_seconds, percentile_cont(.5) WITHIN GROUP (ORDER BY extract(epoch FROM t.completed_at-t.created_at)) FILTER (WHERE t.completed_at IS NOT NULL) median_cycle_seconds ${joins} ${where}`, params);
  const { rows: byRunner } = await pool.query(`SELECT t.runner_id::text runner_id, u.display_name, count(*)::int assigned, count(*) FILTER (WHERE t.status='completed')::int completed, percentile_cont(.5) WITHIN GROUP (ORDER BY extract(epoch FROM t.completed_at-t.created_at)) FILTER (WHERE t.completed_at IS NOT NULL) median_cycle_seconds ${joins} JOIN users u ON u.id=t.runner_id ${where} GROUP BY t.runner_id,u.display_name ORDER BY completed DESC`, params);
  res.json({ days, totals: totals[0], byRunner });
});

apiRouter.get("/shifts", requireDispatcher, async (req: any, res) => {
  const { rows } = await pool.query(`SELECT s.*, u.display_name FROM runner_shifts s JOIN users u ON u.id=s.runner_id JOIN runner_assignments a ON a.runner_id=s.runner_id AND a.dispatcher_id=$2 AND a.organization_id=s.organization_id AND a.active=true WHERE s.organization_id=$1 ORDER BY s.started_at DESC LIMIT 100`, [req.user.organizationId, req.user.sub]);
  res.json({ shifts: rows.map((s) => ({ id:String(s.id), runnerId:String(s.runner_id), displayName:s.display_name, status:s.status, startedAt:s.started_at, endedAt:s.ended_at })) });
});

apiRouter.post("/shifts/start", requireUser, async (req: any, res) => {
  if (req.user.role !== "runner") return res.status(403).json({ error: "forbidden" });
  const { rows } = await pool.query("INSERT INTO runner_shifts (organization_id, runner_id) VALUES ($1,$2) ON CONFLICT (runner_id) WHERE status='active' DO UPDATE SET started_at=runner_shifts.started_at RETURNING *", [req.user.organizationId, req.user.sub]);
  res.json({ shift: rows[0] });
});

apiRouter.post("/shifts/end", requireUser, async (req: any, res) => {
  if (req.user.role !== "runner") return res.status(403).json({ error: "forbidden" });
  const { rows } = await pool.query("UPDATE runner_shifts SET status='ended', ended_at=now() WHERE organization_id=$1 AND runner_id=$2 AND status='active' RETURNING *", [req.user.organizationId, req.user.sub]);
  if (!rows[0]) return res.status(404).json({ error: "active shift not found" });
  res.json({ shift: rows[0] });
});

apiRouter.delete("/tasks/:id", requireDispatcher, async (req: any, res) => {
  const { rows } = await pool.query(
    `DELETE FROM runner_tasks WHERE id = $1 AND organization_id = $2 AND dispatcher_id = $3
     AND status IN ('completed', 'unable_to_complete') RETURNING id`,
    [req.params.id, req.user.organizationId, req.user.sub]
  );
  if (!rows[0]) return res.status(409).json({ error: "only completed tasks can be deleted" });
  res.json({ ok: true, id: String(rows[0].id) });
});
