import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import multer from "multer";
import { z } from "zod";
import { pool } from "../db/pool";
import { config } from "../config";
import { sendTaskAssignmentPush } from "../services/pushNotifications";
import { taskStorage, taskStorageBucket } from "../services/taskStorage";
import {
  clearRunnerLocationData,
  getAllRunnerStates,
  getOnlineRunners,
} from "../services/locationStore";

export const apiRouter = Router();
const taskUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024, files: 5 } });
const allowedAttachmentTypes = new Set(["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]);
const attachmentUpload = taskUpload.array("attachments", 5);

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

const DispatchOperatorSchema = z.object({
  displayName: z.string().trim().min(2).max(80),
});

const IndianMobileSchema = z.string().trim().transform((value) => value.replace(/[\s-]/g, "")).refine(
  (value) => /^(?:\+91|91)?[6-9]\d{9}$/.test(value),
  "clientPhone must be a valid Indian mobile number"
).transform((value) => `+91${value.replace(/^(?:\+91|91)/, "")}`);

const CreateTaskSchema = z.object({
  operatorId: z.coerce.number().int().positive(),
  clientName: z.string().trim().min(2).max(120),
  clientAddress: z.string().trim().min(5).max(500),
  clientPhone: IndianMobileSchema,
  notes: z.string().trim().max(1000).optional(),
  documents: z.array(z.string().trim().min(1).max(120)).min(1).max(30),
  destinationLat: z.number().min(-90).max(90).optional(),
  destinationLon: z.number().min(-180).max(180).optional(),
  priority: z.enum(["normal", "high", "urgent"]).default("normal"),
  dueAt: z.string().datetime().optional(),
}).refine((value) => (value.destinationLat == null) === (value.destinationLon == null), {
  message: "destination coordinates must be provided together",
});

const UpdateTaskSchema = z.object({
  status: z.enum(["sent", "acknowledged", "in_progress", "completed", "unable_to_complete"]),
  incompleteReason: z.enum(["client_unavailable", "client_requested_reschedule", "address_issue", "access_denied", "runner_issue", "vehicle_or_device_issue", "safety_issue", "other"]).optional(),
  incompleteNote: z.string().trim().max(1000).optional(),
  documents: z.array(z.object({ id: z.union([z.string(), z.number()]), collected: z.boolean() })).max(30).optional(),
}).superRefine((value, ctx) => { if (value.status === "unable_to_complete" && !value.incompleteReason) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "incomplete reason is required" }); });

// Editing an existing task must not silently overwrite its original dispatcher
// attribution. The operator is required only when the task is first assigned.
const DispatcherTaskUpdateSchema = z.object({
  clientName: z.string().trim().min(2).max(120),
  clientAddress: z.string().trim().min(5).max(500),
  clientPhone: IndianMobileSchema,
  notes: z.string().trim().max(1000).optional(),
  documents: z.array(z.string().trim().min(1).max(120)).min(1).max(30),
  destinationLat: z.number().min(-90).max(90).optional(),
  destinationLon: z.number().min(-180).max(180).optional(),
  priority: z.enum(["normal", "high", "urgent"]).default("normal"),
  dueAt: z.string().datetime().optional(),
}).refine((value) => (value.destinationLat == null) === (value.destinationLon == null), {
  message: "destination coordinates must be provided together",
});

// Dispatch changes are deliberately separate from the full task edit form.
// This keeps reassignment and rescheduling small, auditable operations and
// avoids accidentally replacing customer details during a live dispatch.
const DispatcherDispatchUpdateSchema = z.object({
  runnerId: z.union([z.string(), z.number()]).transform(String).optional(),
  dueAt: z.string().datetime().nullable().optional(),
  reason: z.string().trim().min(2).max(240).optional(),
}).refine((value) => value.runnerId !== undefined || value.dueAt !== undefined, {
  message: "runnerId or dueAt is required",
});

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
    "SELECT id, email, password_hash, role, display_name, organization_id, is_admin FROM users WHERE email = $1",
    [email]
  );
  if (rows.length === 0) return res.status(401).json({ error: "invalid credentials" });

  const user = rows[0];
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: "invalid credentials" });

  const token = jwt.sign(
    { sub: String(user.id), role: user.role, isAdmin: Boolean(user.is_admin), email: user.email, organizationId: String(user.organization_id) },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn as any }
  );

  res.json({
    token,
    user: {
      id: String(user.id),
      email: user.email,
      role: user.role,
      isAdmin: Boolean(user.is_admin),
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

// Administration is an explicit capability, not another dispatcher role. This
// keeps an administrator able to dispatch while protecting roster changes.
function requireAdmin(req: any, res: any, next: any) {
  requireDispatcher(req, res, () => {
    if (!req.user.isAdmin) return res.status(403).json({ error: "admin access required" });
    next();
  });
}

function taskDto(row: any) {
  return {
    id: String(row.id), runnerId: String(row.runner_id), clientName: row.client_name,
    clientAddress: row.client_address, clientPhone: row.client_phone, notes: row.notes,
    status: row.status, destinationLat: row.destination_lat, destinationLon: row.destination_lon, createdAt: row.created_at, acknowledgedAt: row.acknowledged_at,
    startedAt: row.started_at, completedAt: row.completed_at, priority: row.priority, dueAt: row.due_at, incompleteReason: row.incomplete_reason, incompleteNote: row.incomplete_note,
    createdByOperatorId: row.created_by_operator_id ? String(row.created_by_operator_id) : null,
    createdByOperatorName: row.created_by_operator_name ?? null,
  };
}

async function getActiveDispatchOperator(operatorId: number, organizationId: string) {
  const { rows } = await pool.query(
    "SELECT id, display_name FROM dispatch_operators WHERE id = $1 AND organization_id = $2 AND active = true",
    [operatorId, organizationId],
  );
  return rows[0] ?? null;
}

async function recordTaskEvent(organizationId: string, taskId: string, actorId: string, eventType: string, metadata: Record<string, unknown> = {}) {
  await pool.query("INSERT INTO task_events (organization_id, task_id, actor_id, event_type, metadata) VALUES ($1,$2,$3,$4,$5)", [organizationId, taskId, actorId, eventType, JSON.stringify(metadata)]);
}

async function removeStoredFiles(paths: string[]) {
  if (paths.length === 0 || !taskStorage) return;
  const { error } = await taskStorage.storage.from(taskStorageBucket).remove(paths);
  if (error) console.error("Failed to clean up task attachment files", { bucket: taskStorageBucket, error });
}

function publishCreatedTask(req: any, task: any, runnerId: string) {
  req.app.get("io").to(`runner:${runnerId}`).emit("task:created", task);
  req.app.get("io").to(`dispatchers:${req.user.organizationId}:runner:${runnerId}`).emit("task:created", task);
  void pool.query("SELECT token FROM runner_push_devices WHERE runner_id = $1 AND active = true AND permission_granted = true", [runnerId])
    .then(({ rows: devices }) => sendTaskAssignmentPush(devices.map((device) => device.token), task).then(async (invalidTokens) => {
      if (invalidTokens.length > 0) await pool.query("UPDATE runner_push_devices SET active = false, updated_at = now() WHERE token = ANY($1)", [invalidTokens]);
    }))
    .catch((pushError) => console.error("Failed to send task-assignment push", pushError));
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
  const { rows } = await pool.query(`SELECT task.*, operator.display_name AS created_by_operator_name
    FROM runner_tasks task
    LEFT JOIN dispatch_operators operator ON operator.id = task.created_by_operator_id
    WHERE task.id = $1 AND task.organization_id = $2`, [taskId, organizationId]);
  if (!rows[0]) return null;
  const { rows: documents } = await pool.query(`SELECT id, name, collected, collected_at FROM runner_task_documents WHERE task_id = $1 ORDER BY id`, [taskId]);
  return { ...taskDto(rows[0]), documents: documents.map((d) => ({ id: String(d.id), name: d.name, collected: d.collected, collectedAt: d.collected_at })) };
}

apiRouter.get("/runners", requireDispatcher, async (_req: any, res) => {
  const includeArchived = _req.query.includeArchived === "true";
  // Runners are a shared operational pool. A dispatcher workspace identifies
  // who created a task; it does not limit which runners can be selected.
  const { rows: assignments } = await pool.query(
    `SELECT runner.id, runner.display_name, runner.email,
       EXISTS (
         SELECT 1 FROM runner_assignments assignment
         WHERE assignment.runner_id = runner.id
           AND assignment.organization_id = runner.organization_id
           AND assignment.active = true
       ) AS active
     FROM users runner
     WHERE runner.organization_id = $1 AND runner.role = 'runner'
       ${includeArchived ? "" : `AND EXISTS (
         SELECT 1 FROM runner_assignments assignment
         WHERE assignment.runner_id = runner.id
           AND assignment.organization_id = runner.organization_id
           AND assignment.active = true
       )`}
     ORDER BY runner.display_name ASC`,
    [_req.user.organizationId],
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
apiRouter.post("/runners", requireAdmin, async (req: any, res) => {
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

apiRouter.patch("/runners/:id", requireAdmin, async (req: any, res) => {
  const parsed = UpdateRunnerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid runner details" });

  const { rows } = await pool.query(
    `UPDATE users SET display_name = $1
     WHERE id = $2 AND organization_id = $3 AND role = 'runner'
     RETURNING id, email, display_name`,
    [parsed.data.displayName, req.params.id, req.user.organizationId]
  );
  if (rows.length === 0) return res.status(404).json({ error: "runner not found" });
  const runner = rows[0];
  res.json({ runner: { runnerId: String(runner.id), displayName: runner.display_name, email: runner.email } });
});

// Clear location data without deleting the runner's account or assignment.
apiRouter.delete("/runners/:id/location-data", requireDispatcher, async (req: any, res) => {
  const runnerId = String(req.params.id);
  const { rows: runners } = await pool.query(
    `SELECT 1 FROM users WHERE id = $1 AND organization_id = $2 AND role = 'runner'`,
    [runnerId, req.user.organizationId]
  );
  if (runners.length === 0) return res.status(404).json({ error: "runner not found" });

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
     WHERE h.runner_id = $1 AND runner.organization_id = $2
     ORDER BY ts DESC
     LIMIT $3`,
    [id, req.user.organizationId, limit]
  );
  res.json({ runnerId: id, points: rows.reverse() });
});

// Archive a runner from this dispatcher's workspace without deleting their
// task/location history. The assignment can be restored later.
apiRouter.delete("/runners/:id", requireAdmin, async (req: any, res) => {
  const { rows } = await pool.query(
    `UPDATE runner_assignments SET active = false
     WHERE runner_id = $1 AND organization_id = $2 AND active = true
     RETURNING runner_id`,
    [req.params.id, req.user.organizationId]
  );
  if (!rows[0]) return res.status(404).json({ error: "active runner not found" });
  res.json({ ok: true, runnerId: String(rows[0].runner_id) });
});

apiRouter.post("/runners/:id/restore", requireAdmin, async (req: any, res) => {
  const { rows } = await pool.query(
    `UPDATE runner_assignments SET active = true
     WHERE runner_id = $1 AND organization_id = $2 AND active = false
     RETURNING runner_id`,
    [req.params.id, req.user.organizationId]
  );
  if (!rows[0]) return res.status(404).json({ error: "archived runner not found" });
  res.json({ ok: true, runnerId: String(rows[0].runner_id) });
});

apiRouter.get("/document-types", requireDispatcher, async (req: any, res) => {
  const { rows } = await pool.query(`SELECT id, name FROM document_types WHERE organization_id = $1 AND active = true ORDER BY name`, [req.user.organizationId]);
  res.json({ documentTypes: rows.map((row) => ({ id: String(row.id), name: row.name })) });
});

// Operating dispatchers are session-selected names used for task attribution.
// They are deliberately separate from login accounts so a shared dashboard
// credential can still retain an accurate audit trail.
apiRouter.get("/dispatch-operators", requireDispatcher, async (req: any, res) => {
  const { rows } = await pool.query(
    "SELECT id, display_name, active FROM dispatch_operators WHERE organization_id = $1 AND active = true ORDER BY display_name",
    [req.user.organizationId],
  );
  res.json({ operators: rows.map((row) => ({ id: String(row.id), displayName: row.display_name, active: row.active })) });
});

apiRouter.post("/dispatch-operators", requireAdmin, async (req: any, res) => {
  const parsed = DispatchOperatorSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid dispatcher name" });
  const { rows } = await pool.query(
    "INSERT INTO dispatch_operators (organization_id, display_name) VALUES ($1, $2) RETURNING id, display_name, active",
    [req.user.organizationId, parsed.data.displayName],
  );
  res.status(201).json({ operator: { id: String(rows[0].id), displayName: rows[0].display_name, active: rows[0].active } });
});

apiRouter.patch("/dispatch-operators/:id", requireAdmin, async (req: any, res) => {
  const parsed = DispatchOperatorSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid dispatcher name" });
  const { rows } = await pool.query(
    "UPDATE dispatch_operators SET display_name = $1 WHERE id = $2 AND organization_id = $3 AND active = true RETURNING id, display_name, active",
    [parsed.data.displayName, req.params.id, req.user.organizationId],
  );
  if (!rows[0]) return res.status(404).json({ error: "dispatcher not found" });
  res.json({ operator: { id: String(rows[0].id), displayName: rows[0].display_name, active: rows[0].active } });
});

apiRouter.delete("/dispatch-operators/:id", requireAdmin, async (req: any, res) => {
  const { rows } = await pool.query(
    "UPDATE dispatch_operators SET active = false WHERE id = $1 AND organization_id = $2 AND active = true RETURNING id",
    [req.params.id, req.user.organizationId],
  );
  if (!rows[0]) return res.status(404).json({ error: "dispatcher not found" });
  res.json({ ok: true });
});

apiRouter.get("/runners/:id/tasks", requireDispatcher, async (req: any, res) => {
  const runnerId = String(req.params.id);
  const { rows: runners } = await pool.query(`SELECT 1 FROM users WHERE id = $1 AND organization_id = $2 AND role = 'runner'`, [runnerId, req.user.organizationId]);
  if (!runners[0]) return res.status(404).json({ error: "runner not found" });
  const { rows } = await pool.query(`SELECT * FROM runner_tasks WHERE organization_id = $1 AND runner_id = $2 AND status NOT IN ('completed', 'unable_to_complete') ORDER BY created_at DESC`, [req.user.organizationId, runnerId]);
  const tasks = await Promise.all(rows.map((row) => getTask(String(row.id), String(req.user.organizationId))));
  res.json({ tasks });
});

// The dashboard uses this endpoint for assignment so files and task creation
// share one all-or-nothing workflow. A runner never sees a task until every
// attachment is safely stored and the database transaction has committed.
apiRouter.post("/runners/:id/tasks/with-attachments", requireDispatcher, (req: any, res, next) => {
  attachmentUpload(req, res, (uploadError) => {
    if (uploadError instanceof multer.MulterError) {
      return res.status(400).json({ error: uploadError.code === "LIMIT_FILE_SIZE" ? "each attachment must be 25 MB or smaller" : "too many attachments" });
    }
    if (uploadError) return next(uploadError);
    next();
  });
}, async (req: any, res) => {
  let body: unknown;
  try { body = JSON.parse(req.body.task); }
  catch { return res.status(400).json({ error: "invalid task details" }); }
  const parsed = CreateTaskSchema.safeParse(body);
  if (!parsed.success) return res.status(400).json({ error: "invalid task details" });

  const runnerId = String(req.params.id);
  const operator = await getActiveDispatchOperator(parsed.data.operatorId, String(req.user.organizationId));
  if (!operator) return res.status(400).json({ error: "select an active dispatcher before assigning a task" });
  const { rows: runners } = await pool.query(`SELECT 1 FROM users WHERE id = $1 AND organization_id = $2 AND role = 'runner'`, [runnerId, req.user.organizationId]);
  if (!runners[0]) return res.status(404).json({ error: "runner not found" });

  const files = (req.files ?? []) as Express.Multer.File[];
  if (files.some((file) => !allowedAttachmentTypes.has(file.mimetype))) {
    return res.status(400).json({ error: "only PDF, DOC, and DOCX files are allowed" });
  }
  if (files.length > 0 && !taskStorage) return res.status(503).json({ error: "document storage is not configured" });

  const idempotencyKey = req.get("Idempotency-Key");
  if (!idempotencyKey || idempotencyKey.length > 120) {
    return res.status(400).json({ error: "a valid Idempotency-Key header is required" });
  }
  // A crash before cleanup should not block a fresh submission forever.
  await pool.query("DELETE FROM task_assignment_requests WHERE organization_id = $1 AND dispatcher_id = $2 AND task_id IS NULL AND created_at < now() - interval '10 minutes'", [req.user.organizationId, req.user.sub]);
  const { rows: requestRows } = await pool.query("INSERT INTO task_assignment_requests (organization_id, dispatcher_id, idempotency_key) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING task_id", [req.user.organizationId, req.user.sub, idempotencyKey]);
  if (!requestRows[0]) {
    const { rows: previous } = await pool.query("SELECT task_id FROM task_assignment_requests WHERE organization_id = $1 AND dispatcher_id = $2 AND idempotency_key = $3", [req.user.organizationId, req.user.sub, idempotencyKey]);
    if (previous[0]?.task_id) {
      const task = await getTask(String(previous[0].task_id), String(req.user.organizationId));
      return res.status(200).json({ task });
    }
    return res.status(409).json({ error: "this task submission is already being processed; retry shortly" });
  }

  const uploadId = crypto.randomUUID();
  const stagedPaths: string[] = [];
  const finalPaths: string[] = [];
  try {
    for (const file of files) {
      const extension = file.originalname.split(".").pop()?.toLowerCase() ?? "bin";
      const stagedPath = `staging/org/${req.user.organizationId}/tasks/${uploadId}/${crypto.randomUUID()}.${extension}`;
      const { error } = await taskStorage!.storage.from(taskStorageBucket).upload(stagedPath, file.buffer, { contentType: file.mimetype, upsert: false });
      if (error) throw new Error("attachment storage failed");
      stagedPaths.push(stagedPath);
    }
  } catch (error) {
    await removeStoredFiles(stagedPaths);
    await pool.query("DELETE FROM task_assignment_requests WHERE organization_id = $1 AND dispatcher_id = $2 AND idempotency_key = $3 AND task_id IS NULL", [req.user.organizationId, req.user.sub, idempotencyKey]);
    console.error("Failed to stage task attachments", { organizationId: req.user.organizationId, error });
    return res.status(502).json({ error: "attachments could not be uploaded; task was not created" });
  }

  const client = await pool.connect();
  let committed = false;
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(`INSERT INTO runner_tasks (organization_id, dispatcher_id, created_by_operator_id, runner_id, client_name, client_address, client_phone, notes, destination_lat, destination_lon, priority, due_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`, [req.user.organizationId, req.user.sub, operator.id, runnerId, parsed.data.clientName, parsed.data.clientAddress, parsed.data.clientPhone, parsed.data.notes || null, parsed.data.destinationLat ?? null, parsed.data.destinationLon ?? null, parsed.data.priority, parsed.data.dueAt ?? null]);
    const taskId = String(rows[0].id);
    for (const document of [...new Set(parsed.data.documents)]) await client.query("INSERT INTO runner_task_documents (task_id, name) VALUES ($1, $2)", [taskId, document]);

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const extension = file.originalname.split(".").pop()?.toLowerCase() ?? "bin";
      const finalPath = `org/${req.user.organizationId}/tasks/${taskId}/${crypto.randomUUID()}.${extension}`;
      const { error } = await taskStorage!.storage.from(taskStorageBucket).move(stagedPaths[index], finalPath);
      if (error) throw new Error("attachment storage failed");
      finalPaths.push(finalPath);
      await client.query("INSERT INTO runner_task_attachments (task_id, organization_id, storage_path, original_name, content_type, size_bytes, uploaded_by) VALUES ($1,$2,$3,$4,$5,$6,$7)", [taskId, req.user.organizationId, finalPath, file.originalname, file.mimetype, file.size, req.user.sub]);
    }
    await client.query("UPDATE task_assignment_requests SET task_id = $1 WHERE organization_id = $2 AND dispatcher_id = $3 AND idempotency_key = $4", [taskId, req.user.organizationId, req.user.sub, idempotencyKey]);
    await client.query("INSERT INTO task_events (organization_id, task_id, actor_id, event_type, metadata) VALUES ($1,$2,$3,$4,$5)", [req.user.organizationId, taskId, req.user.sub, "created", JSON.stringify({ priority: parsed.data.priority, dueAt: parsed.data.dueAt ?? null, attachments: files.length, operatorId: operator.id, operatorName: operator.display_name })]);
    await client.query("COMMIT");
    committed = true;
    const task = await getTask(taskId, String(req.user.organizationId));
    publishCreatedTask(req, task, runnerId);
    res.status(201).json({ task });
  } catch (error) {
    if (!committed) {
      await client.query("ROLLBACK");
      await removeStoredFiles([...stagedPaths, ...finalPaths]);
      await pool.query("DELETE FROM task_assignment_requests WHERE organization_id = $1 AND dispatcher_id = $2 AND idempotency_key = $3 AND task_id IS NULL", [req.user.organizationId, req.user.sub, idempotencyKey]);
      console.error("Atomic task assignment failed", { organizationId: req.user.organizationId, error });
      return res.status(502).json({ error: "attachments could not be finalized; task was not created" });
    }
    console.error("Task assignment committed but response handling failed", { organizationId: req.user.organizationId, error });
    res.status(500).json({ error: "task was created but confirmation failed; refresh before retrying" });
  } finally {
    client.release();
  }
});

apiRouter.post("/runners/:id/tasks", requireDispatcher, async (req: any, res) => {
  const parsed = CreateTaskSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid task details" });
  const runnerId = String(req.params.id);
  const operator = await getActiveDispatchOperator(parsed.data.operatorId, String(req.user.organizationId));
  if (!operator) return res.status(400).json({ error: "select an active dispatcher before assigning a task" });
  const { rows: runners } = await pool.query(`SELECT 1 FROM users WHERE id = $1 AND organization_id = $2 AND role = 'runner'`, [runnerId, req.user.organizationId]);
  if (!runners[0]) return res.status(404).json({ error: "runner not found" });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(`INSERT INTO runner_tasks (organization_id, dispatcher_id, created_by_operator_id, runner_id, client_name, client_address, client_phone, notes, destination_lat, destination_lon, priority, due_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`, [req.user.organizationId, req.user.sub, operator.id, runnerId, parsed.data.clientName, parsed.data.clientAddress, parsed.data.clientPhone, parsed.data.notes || null, parsed.data.destinationLat ?? null, parsed.data.destinationLon ?? null, parsed.data.priority, parsed.data.dueAt ?? null]);
    for (const document of [...new Set(parsed.data.documents)]) await client.query(`INSERT INTO runner_task_documents (task_id, name) VALUES ($1, $2)`, [rows[0].id, document]);
    await client.query("COMMIT");
    await recordTaskEvent(req.user.organizationId, String(rows[0].id), req.user.sub, "created", { priority: parsed.data.priority, dueAt: parsed.data.dueAt ?? null, operatorId: operator.id, operatorName: operator.display_name });
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
  const scope = ["active", "completed", "incomplete"].includes(String(req.query.scope))
    ? String(req.query.scope)
    : "active";
  const runnerFilter = req.user.role === "runner" ? "AND runner_id = $2" : "";
  const statusFilter = scope === "completed"
    ? "AND status = 'completed'"
    : scope === "incomplete"
      ? "AND status = 'unable_to_complete'"
      : "AND status NOT IN ('completed', 'unable_to_complete')";
  const params = req.user.role === "runner" ? [req.user.organizationId, req.user.sub] : [req.user.organizationId];
  const { rows } = await pool.query(`SELECT * FROM runner_tasks WHERE organization_id = $1 ${runnerFilter} ${statusFilter} ORDER BY COALESCE(completed_at, created_at) DESC`, params);
  const tasks = await Promise.all(rows.map((row) => getTask(String(row.id), String(req.user.organizationId))));
  res.json({ tasks });
});

apiRouter.get("/tasks/:id/attachments", requireUser, async (req: any, res) => {
  const { rows: access } = await pool.query("SELECT 1 FROM runner_tasks WHERE id=$1 AND organization_id=$2 AND (runner_id=$3 OR $4='dispatcher')", [req.params.id, req.user.organizationId, req.user.sub, req.user.role]);
  if (!access[0]) return res.status(404).json({ error: "task not found" });
  const { rows } = await pool.query("SELECT id, original_name, content_type, size_bytes, created_at FROM runner_task_attachments WHERE task_id = $1 AND organization_id = $2 ORDER BY created_at DESC", [req.params.id, req.user.organizationId]);
  res.json({ attachments: rows.map((row) => ({ id: String(row.id), name: row.original_name, contentType: row.content_type, sizeBytes: Number(row.size_bytes), createdAt: row.created_at })) });
});

apiRouter.post("/tasks/:id/attachments", requireDispatcher, taskUpload.single("file"), async (req: any, res) => {
  if (!taskStorage) return res.status(503).json({ error: "document storage is not configured" });
  const file = req.file;
  if (!file || !allowedAttachmentTypes.has(file.mimetype)) return res.status(400).json({ error: "only PDF, DOC, and DOCX files are allowed" });
  const task = await getTask(String(req.params.id), String(req.user.organizationId));
  if (!task || task.runnerId == null) return res.status(404).json({ error: "task not found" });
  const extension = file.originalname.split(".").pop()?.toLowerCase() ?? "bin";
  const path = `org/${req.user.organizationId}/tasks/${task.id}/${crypto.randomUUID()}.${extension}`;
  const { error } = await taskStorage.storage.from(taskStorageBucket).upload(path, file.buffer, { contentType: file.mimetype, upsert: false });
  if (error) {
    console.error("Failed to store task attachment", { taskId: task.id, bucket: taskStorageBucket, error });
    return res.status(502).json({ error: "document storage is unavailable; please retry or contact support" });
  }
  const { rows } = await pool.query("INSERT INTO runner_task_attachments (task_id, organization_id, storage_path, original_name, content_type, size_bytes, uploaded_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, original_name, content_type, size_bytes, created_at", [task.id, req.user.organizationId, path, file.originalname, file.mimetype, file.size, req.user.sub]);
  await recordTaskEvent(req.user.organizationId, task.id, req.user.sub, "attachment_added", { name: file.originalname });
  res.status(201).json({ attachment: { id: String(rows[0].id), name: rows[0].original_name, contentType: rows[0].content_type, sizeBytes: Number(rows[0].size_bytes), createdAt: rows[0].created_at } });
});

apiRouter.get("/tasks/:id/attachments/:attachmentId/download", requireUser, async (req: any, res) => {
  if (!taskStorage) return res.status(503).json({ error: "document storage is not configured" });
  const { rows: access } = await pool.query("SELECT 1 FROM runner_tasks WHERE id=$1 AND organization_id=$2 AND (runner_id=$3 OR $4='dispatcher')", [req.params.id, req.user.organizationId, req.user.sub, req.user.role]);
  if (!access[0]) return res.status(404).json({ error: "task not found" });
  const { rows } = await pool.query("SELECT storage_path FROM runner_task_attachments WHERE id = $1 AND task_id = $2 AND organization_id = $3", [req.params.attachmentId, req.params.id, req.user.organizationId]);
  if (!rows[0]) return res.status(404).json({ error: "attachment not found" });
  const { data, error } = await taskStorage.storage.from(taskStorageBucket).createSignedUrl(rows[0].storage_path, 300);
  if (error || !data) return res.status(502).json({ error: "could not create download link" });
  res.json({ url: data.signedUrl, expiresIn: 300 });
});

apiRouter.delete("/tasks/:id/attachments/:attachmentId", requireDispatcher, async (req: any, res) => {
  if (!taskStorage) return res.status(503).json({ error: "document storage is not configured" });
  const { rows } = await pool.query(`SELECT attachment.storage_path, attachment.original_name
    FROM runner_task_attachments attachment
    JOIN runner_tasks task ON task.id = attachment.task_id
    WHERE attachment.id = $1 AND attachment.task_id = $2 AND attachment.organization_id = $3
      AND task.status = 'sent'`, [req.params.attachmentId, req.params.id, req.user.organizationId]);
  if (!rows[0]) return res.status(404).json({ error: "attachment not found or task can no longer be edited" });

  const { error } = await taskStorage.storage.from(taskStorageBucket).remove([rows[0].storage_path]);
  if (error) {
    console.error("Failed to delete task attachment", { taskId: req.params.id, attachmentId: req.params.attachmentId, error });
    return res.status(502).json({ error: "could not delete attachment from storage" });
  }
  await pool.query("DELETE FROM runner_task_attachments WHERE id = $1 AND task_id = $2 AND organization_id = $3", [req.params.attachmentId, req.params.id, req.user.organizationId]);
  await recordTaskEvent(req.user.organizationId, String(req.params.id), req.user.sub, "attachment_removed", { name: rows[0].original_name });
  res.json({ ok: true, id: String(req.params.attachmentId) });
});

apiRouter.post("/tasks/:id/dispatch", requireDispatcher, async (req: any, res) => {
  const parsed = DispatcherDispatchUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid dispatch update" });

  const task = await getTask(String(req.params.id), String(req.user.organizationId));
  if (!task || task.runnerId == null) return res.status(404).json({ error: "task not found" });
  if (task.status !== "sent") {
    return res.status(409).json({ error: "only unacknowledged tasks can be reassigned or rescheduled" });
  }

  const nextRunnerId = parsed.data.runnerId ?? task.runnerId;
  if (parsed.data.runnerId) {
    const { rows: runners } = await pool.query(
      `SELECT 1 FROM users WHERE id = $1 AND organization_id = $2 AND role = 'runner'`,
      [nextRunnerId, req.user.organizationId],
    );
    if (!runners[0]) return res.status(400).json({ error: "runner is not available" });
  }

  const dueAtChanged = parsed.data.dueAt !== undefined && parsed.data.dueAt !== task.dueAt;
  const runnerChanged = nextRunnerId !== task.runnerId;
  if (!runnerChanged && !dueAtChanged) return res.json({ task, unchanged: true });

  await pool.query(
    `UPDATE runner_tasks SET runner_id = $1, due_at = $2
     WHERE id = $3 AND organization_id = $4 AND status = 'sent'`,
    [nextRunnerId, parsed.data.dueAt === undefined ? task.dueAt : parsed.data.dueAt, task.id, req.user.organizationId],
  );
  const updated = await getTask(task.id, String(req.user.organizationId));
  const metadata = {
    reason: parsed.data.reason ?? null,
    previousRunnerId: task.runnerId,
    nextRunnerId,
    previousDueAt: task.dueAt ?? null,
    nextDueAt: updated?.dueAt ?? null,
  };
  await recordTaskEvent(req.user.organizationId, task.id, req.user.sub, runnerChanged ? "reassigned" : "rescheduled", metadata);

  // Notify both devices. The previous runner receives the same updated task,
  // allowing their client to remove it during its normal task reconciliation.
  req.app.get("io").to(`runner:${task.runnerId}`).emit("task:updated", updated);
  req.app.get("io").to(`runner:${nextRunnerId}`).emit("task:updated", updated);
  req.app.get("io").to(`dispatchers:${req.user.organizationId}:runner:${task.runnerId}`).emit("task:updated", updated);
  req.app.get("io").to(`dispatchers:${req.user.organizationId}:runner:${nextRunnerId}`).emit("task:updated", updated);
  res.json({ task: updated });
});

apiRouter.patch("/tasks/:id", requireUser, async (req: any, res) => {
  if (req.user.role === "dispatcher") {
    const parsed = DispatcherTaskUpdateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "invalid task update" });
    const { rows } = await pool.query(
      `UPDATE runner_tasks SET client_name = $1, client_address = $2, client_phone = $3, notes = $4,
       destination_lat = $5, destination_lon = $6, priority = $7, due_at = $8
       WHERE id = $9 AND organization_id = $10 AND status = 'sent'
       RETURNING id`,
      [parsed.data.clientName, parsed.data.clientAddress, parsed.data.clientPhone, parsed.data.notes || null,
        parsed.data.destinationLat ?? null, parsed.data.destinationLon ?? null, parsed.data.priority, parsed.data.dueAt ?? null, req.params.id,
        req.user.organizationId]
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
  const params: any[] = [req.user.organizationId, days];
  const filter = runnerId ? "AND t.runner_id = $3" : "";
  if (runnerId) params.push(runnerId);
  const joins = `FROM runner_tasks t`;
  const where = `WHERE t.organization_id=$1 AND t.created_at >= now() - ($2::text || ' days')::interval ${filter}`;
  const { rows: totals } = await pool.query(`SELECT count(*)::int assigned, count(*) FILTER (WHERE t.status='completed')::int completed, count(*) FILTER (WHERE t.status='unable_to_complete')::int unable, count(*) FILTER (WHERE t.due_at < now() AND t.status NOT IN ('completed','unable_to_complete'))::int overdue, percentile_cont(.5) WITHIN GROUP (ORDER BY extract(epoch FROM t.acknowledged_at-t.created_at)) FILTER (WHERE t.acknowledged_at IS NOT NULL) median_ack_seconds, percentile_cont(.5) WITHIN GROUP (ORDER BY extract(epoch FROM t.completed_at-t.created_at)) FILTER (WHERE t.completed_at IS NOT NULL) median_cycle_seconds ${joins} ${where}`, params);
  const { rows: byRunner } = await pool.query(`SELECT t.runner_id::text runner_id, u.display_name, count(*)::int assigned, count(*) FILTER (WHERE t.status='completed')::int completed, percentile_cont(.5) WITHIN GROUP (ORDER BY extract(epoch FROM t.completed_at-t.created_at)) FILTER (WHERE t.completed_at IS NOT NULL) median_cycle_seconds ${joins} JOIN users u ON u.id=t.runner_id ${where} GROUP BY t.runner_id,u.display_name ORDER BY completed DESC`, params);
  res.json({ days, totals: totals[0], byRunner });
});

apiRouter.get("/shifts", requireDispatcher, async (req: any, res) => {
  const { rows } = await pool.query(`SELECT s.*, u.display_name FROM runner_shifts s JOIN users u ON u.id=s.runner_id WHERE s.organization_id=$1 ORDER BY s.started_at DESC LIMIT 100`, [req.user.organizationId]);
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
    `DELETE FROM runner_tasks WHERE id = $1 AND organization_id = $2
     AND status IN ('completed', 'unable_to_complete') RETURNING id`,
    [req.params.id, req.user.organizationId]
  );
  if (!rows[0]) return res.status(409).json({ error: "only completed tasks can be deleted" });
  res.json({ ok: true, id: String(rows[0].id) });
});
