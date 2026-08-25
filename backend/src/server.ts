import express from "express";
import cors from "cors";
import http from "http";
import { Server as IOServer } from "socket.io";
import { config } from "./config";
import { apiRouter } from "./routes";
import { attachSockets } from "./sockets";
import { pool } from "./db/pool";
import { redis } from "./services/redis";

async function main() {
  const app = express();
  app.set("trust proxy", config.trustProxy);
  app.disable("x-powered-by");
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
    res.setHeader("Cross-Origin-Resource-Policy", "same-site");
    next();
  });
  app.use(
    cors({
      origin(origin, callback) {
        // Native mobile clients do not normally send an Origin header. Browser
        // requests must match an explicit dashboard origin.
        if (!origin || config.corsOrigins.includes(origin)) return callback(null, true);
        return callback(new Error("Origin is not allowed"));
      },
      // Dashboard account management uses PATCH to rename runners and DELETE
      // to clear a runner's retained location data. Include these methods in
      // browser preflight responses as well as the existing read/create APIs.
      methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Authorization", "Content-Type", "Idempotency-Key"],
      maxAge: 86_400,
    })
  );
  app.use(express.json({ limit: "1mb" }));

  app.get("/", (_req, res) => res.json({ name: "TrackRunner API", ok: true }));
  app.use("/api", apiRouter);

  const server = http.createServer(app);
  const io = new IOServer(server, {
    cors: {
      origin(origin, callback) {
        if (!origin || config.corsOrigins.includes(origin)) return callback(null, true);
        return callback(new Error("Origin is not allowed"), false);
      },
      methods: ["GET", "POST"],
      allowedHeaders: ["Authorization", "Content-Type"],
    },
    transports: ["websocket", "polling"],
  });
  app.set("io", io);
  attachSockets(io);

  app.get("/api/ready", async (_req, res) => {
    try {
      await Promise.all([pool.query("SELECT 1"), redis.ping()]);
      res.json({ ok: true });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[server] readiness failed:", err);
      res.status(503).json({ ok: false });
    }
  });

  server.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(`[server] listening on http://0.0.0.0:${config.port}`);
  });

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    // eslint-disable-next-line no-console
    console.log(`[server] received ${signal}; shutting down`);
    io.close();
    server.close(async (closeError) => {
      if (closeError) {
        // eslint-disable-next-line no-console
        console.error("[server] HTTP close failed:", closeError);
      }
      await Promise.allSettled([pool.end(), redis.quit()]);
      process.exit(closeError ? 1 : 0);
    });
  };

  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[server] fatal:", err);
  process.exit(1);
});
