import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { pool } from "../db/pool";
import { config } from "../config";
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

apiRouter.get("/runners", requireDispatcher, async (_req: any, res) => {
  const { rows: assignments } = await pool.query(
    `SELECT runner.id, runner.display_name, runner.email
     FROM runner_assignments assignment
     JOIN users runner ON runner.id = assignment.runner_id
     WHERE assignment.dispatcher_id = $1
       AND assignment.organization_id = $2
       AND assignment.active = true
     ORDER BY runner.display_name ASC`,
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
