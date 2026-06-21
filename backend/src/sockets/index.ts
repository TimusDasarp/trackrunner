import { Server, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { config } from "../config";
import {
  LocationPayloadSchema,
  LocationBatchSchema,
  type LocationPayload,
} from "../services/schemas";
import {
  saveLocation,
  markOnline,
  markOffline,
} from "../services/locationStore";

interface AuthedSocket extends Socket {
  data: {
    userId: string;
    role: "runner" | "dispatcher";
    email: string;
  };
}

function verifyToken(token: string): { userId: string; role: "runner" | "dispatcher"; email: string } {
  const decoded = jwt.verify(token, config.jwtSecret) as any;
  if (!decoded?.sub || !decoded?.role) {
    throw new Error("invalid token payload");
  }
  return {
    userId: String(decoded.sub),
    role: decoded.role,
    email: decoded.email ?? "",
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

  io.on("connection", (socket: Socket) => {
    const s = socket as AuthedSocket;
    const { userId, role } = s.data;
    // eslint-disable-next-line no-console
    console.log(`[ws] connect user=${userId} role=${role} sid=${s.id}`);

    // Runners join a private room; dispatchers join the dashboard room.
    if (role === "runner") {
      s.join(`runner:${userId}`);
      markOnline(userId).catch(() => {});
      // eslint-disable-next-line no-console
      console.log(`[ws] runner connected user=${userId} sid=${s.id}`);
    } else {
      s.join("dispatchers");
      // eslint-disable-next-line no-console
      console.log(`[ws] dispatcher connected user=${userId} sid=${s.id}`);
    }

    // --- Runner -> Server: single location ---
    s.on("runner:location", async (raw: unknown) => {
      if (role !== "runner") return;
      const parsed = LocationPayloadSchema.safeParse(raw);
      if (!parsed.success) {
        s.emit("error:bad-payload", { event: "runner:location", issues: parsed.error.issues });
        return;
      }
      const payload: LocationPayload = parsed.data;
      // Enforce that the runner can only emit their own location.
      if (String(payload.runnerId) !== userId) {
        s.emit("error:forbidden", { reason: "runnerId mismatch" });
        return;
      }
      // eslint-disable-next-line no-console
      console.log(`[ws] runner:location from=${userId} ts=${payload.ts} lat=${payload.lat} lon=${payload.lon}`);
      try {
        await saveLocation(payload);
        io.to("dispatchers").emit("runner:location", payload);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[ws] saveLocation failed:", err);
      }
    });

    // --- Runner -> Server: batch (offline cache flush) ---
    s.on("runner:location:batch", async (raw: unknown) => {
      if (role !== "runner") return;
      const parsed = LocationBatchSchema.safeParse(raw);
      if (!parsed.success) {
        s.emit("error:bad-payload", { event: "runner:location:batch", issues: parsed.error.issues });
        return;
      }
      const batch = parsed.data.filter((p) => String(p.runnerId) === userId);
      if (batch.length === 0) return;
      // eslint-disable-next-line no-console
      console.log(`[ws] runner:location:batch from=${userId} count=${batch.length} latestTs=${batch[batch.length - 1].ts}`);
      try {
        // Persist each, then broadcast the latest one to dashboards.
        for (const p of batch) await saveLocation(p);
        const latest = batch[batch.length - 1];
        io.to("dispatchers").emit("runner:location", latest);
        io.to("dispatchers").emit("runner:location:batch", batch);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[ws] batch save failed:", err);
      }
    });

    s.on("disconnect", async () => {
      // eslint-disable-next-line no-console
      console.log(`[ws] disconnect user=${userId} sid=${s.id}`);
      if (role === "runner") {
        await markOffline(userId).catch(() => {});
        io.to("dispatchers").emit("runner:offline", { runnerId: userId });
      }
    });
  });
}
