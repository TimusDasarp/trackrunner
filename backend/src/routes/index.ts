import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { pool } from "../db/pool";
import { config } from "../config";
import { getAllRunnerStates, getOnlineRunners } from "../services/locationStore";

export const apiRouter = Router();

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

apiRouter.post("/auth/login", async (req, res) => {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid body" });

  const { email, password } = parsed.data;
  const { rows } = await pool.query(
    "SELECT id, email, password_hash, role, display_name FROM users WHERE email = $1",
    [email]
  );
  if (rows.length === 0) return res.status(401).json({ error: "invalid credentials" });

  const user = rows[0];
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: "invalid credentials" });

  const token = jwt.sign(
    { sub: String(user.id), role: user.role, email: user.email },
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
    if (claims.role !== "dispatcher") return res.status(403).json({ error: "forbidden" });
    req.user = claims;
    next();
  } catch {
    res.status(401).json({ error: "invalid token" });
  }
}

apiRouter.get("/runners", requireDispatcher, async (_req, res) => {
  const states = await getAllRunnerStates();
  const online = new Set(await getOnlineRunners());
  const runners = Object.entries(states).map(([id, s]: [string, any]) => ({
    runnerId: id,
    lat: Number(s.lat),
    lon: Number(s.lon),
    accuracy: s.accuracy ? Number(s.accuracy) : null,
    speed: s.speed ? Number(s.speed) : null,
    bearing: s.bearing ? Number(s.bearing) : null,
    battery: s.battery ? Number(s.battery) : null,
    ts: Number(s.ts),
    online: online.has(id),
  }));
  res.json({ runners });
});

apiRouter.get("/runners/:id/history", requireDispatcher, async (req, res) => {
  const id = req.params.id;
  const limit = Math.min(Number(req.query.limit ?? 500), 5000);
  const { rows } = await pool.query(
    `SELECT lat, lon, accuracy, speed, bearing, altitude, battery, ts
     FROM location_history
     WHERE runner_id = $1
     ORDER BY ts DESC
     LIMIT $2`,
    [id, limit]
  );
  res.json({ runnerId: id, points: rows.reverse() });
});
