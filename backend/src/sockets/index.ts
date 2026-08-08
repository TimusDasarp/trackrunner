import { Server, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { config } from "../config";
import { pool } from "../db/pool";
import {
  LocationPayloadSchema,
  LocationBatchSchema,
  TrackingStatusSchema,
  type LocationPayload,
} from "../services/schemas";
import {
  saveLocation,
  persistLocations,
  markOnline,
  markOffline,
  setTrackingActive,
} from "../services/locationStore";

interface AuthedSocket extends Socket {
  data: {
    userId: string;
    role: "runner" | "dispatcher";
    email: string;
    organizationId: string;
  };
}

function verifyToken(token: string): { userId: string; role: "runner" | "dispatcher"; email: string; organizationId: string } {
  const decoded = jwt.verify(token, config.jwtSecret) as any;
  if (!decoded?.sub || !decoded?.role || !decoded?.organizationId) {
    throw new Error("invalid token payload");
  }
  return {
    userId: String(decoded.sub),
    role: decoded.role,
    email: decoded.email ?? "",
    organizationId: String(decoded.organizationId),
  };
}

export function attachSockets(io: Server) {
  // --- Auth middleware ---
  io.use((socket: Socket, next) => {
    try {
      const token =
        (socket.handshake.auth?.token as string | undefined) ??
        (socket.handshake.query?.token as string | undefined);
      if (!token) return next(new Error("missing token"));
      const claims = verifyToken(token);
      (socket as AuthedSocket).data = claims;
      next();
    } catch (err) {
      next(new Error("unauthorized"));
    }
  });

  io.on("connection", async (socket: Socket) => {
    const s = socket as AuthedSocket;
    const { userId, role, organizationId } = s.data;
    // eslint-disable-next-line no-console
    console.log(`[ws] connect user=${userId} role=${role} sid=${s.id}`);

    // Runners join a private room; dispatchers join the dashboard room.
    if (role === "runner") {
      s.join(`runner:${userId}`);
      markOnline(userId).catch(() => {});
      // eslint-disable-next-line no-console
      console.log(`[ws] runner connected user=${userId} sid=${s.id}`);
    } else {
      const { rows: assignments } = await pool.query(
        `SELECT runner_id FROM runner_assignments
         WHERE dispatcher_id = $1 AND organization_id = $2 AND active = true`,
        [userId, organizationId]
      );
      assignments.forEach((assignment) =>
        s.join(`dispatchers:${organizationId}:runner:${assignment.runner_id}`)
      );
      // eslint-disable-next-line no-console
      console.log(`[ws] dispatcher connected user=${userId} sid=${s.id}`);
    }

    // --- Runner -> Server: single location ---
    s.on("runner:tracking", async (raw: unknown, ack?: (result: unknown) => void) => {
      if (role !== "runner") return;
      const parsed = TrackingStatusSchema.safeParse(raw);
      if (!parsed.success) return ack?.({ ok: false, error: "bad-payload" });
      try {
        await setTrackingActive(userId, parsed.data.active);
        io.to(`dispatchers:${organizationId}:runner:${userId}`).emit("runner:status", {
          runnerId: userId,
          trackingActive: parsed.data.active,
        });
        ack?.({ ok: true });
      } catch (err) {
        console.error("[ws] tracking status failed:", err);
        ack?.({ ok: false, error: "persistence-failed" });
      }
    });

    // --- Runner -> Server: single location ---
    s.on("runner:location", async (raw: unknown, ack?: (result: unknown) => void) => {
      if (role !== "runner") return;
      const parsed = LocationPayloadSchema.safeParse(raw);
      if (!parsed.success) {
        s.emit("error:bad-payload", { event: "runner:location", issues: parsed.error.issues });
        return ack?.({ ok: false, error: "bad-payload" });
      }
      const payload: LocationPayload = parsed.data;
      // Enforce that the runner can only emit their own location.
      if (String(payload.runnerId) !== userId) {
        s.emit("error:forbidden", { reason: "runnerId mismatch" });
        return ack?.({ ok: false, error: "forbidden" });
      }
      // eslint-disable-next-line no-console
      console.log(`[ws] runner:location from=${userId} ts=${payload.ts} lat=${payload.lat} lon=${payload.lon}`);
      try {
        await persistLocations([payload]);
        await saveLocation(payload, organizationId);
        io.to(`dispatchers:${organizationId}:runner:${userId}`).emit("runner:location", payload);
        ack?.({ ok: true, acceptedEventIds: [payload.eventId] });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[ws] saveLocation failed:", err);
        ack?.({ ok: false, error: "persistence-failed" });
      }
    });

    // --- Runner -> Server: batch (offline cache flush) ---
    s.on("runner:location:batch", async (raw: unknown, ack?: (result: unknown) => void) => {
      if (role !== "runner") return;
      const parsed = LocationBatchSchema.safeParse(raw);
      if (!parsed.success) {
        s.emit("error:bad-payload", { event: "runner:location:batch", issues: parsed.error.issues });
        return ack?.({ ok: false, error: "bad-payload" });
      }
      const batch = parsed.data.filter((p) => String(p.runnerId) === userId);
      if (batch.length === 0) return ack?.({ ok: false, error: "forbidden" });
      // eslint-disable-next-line no-console
      console.log(`[ws] runner:location:batch from=${userId} count=${batch.length} latestTs=${batch[batch.length - 1].ts}`);
      try {
        const acceptedEventIds = await persistLocations(batch);
        const latest = batch[batch.length - 1];
        await saveLocation(latest, organizationId);
        io.to(`dispatchers:${organizationId}:runner:${userId}`).emit("runner:location", latest);
        io.to(`dispatchers:${organizationId}:runner:${userId}`).emit("runner:location:batch", batch);
        ack?.({ ok: true, acceptedEventIds });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[ws] batch save failed:", err);
        ack?.({ ok: false, error: "persistence-failed" });
      }
    });

    s.on("disconnect", async () => {
      // eslint-disable-next-line no-console
      console.log(`[ws] disconnect user=${userId} sid=${s.id}`);
      if (role === "runner") {
        await markOffline(userId).catch(() => {});
        io.to(`dispatchers:${organizationId}:runner:${userId}`).emit("runner:offline", { runnerId: userId });
      }
    });
  });
}
