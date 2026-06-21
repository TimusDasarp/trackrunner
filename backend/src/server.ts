import express from "express";
import cors from "cors";
import http from "http";
import { Server as IOServer } from "socket.io";
import { config } from "./config";
import { apiRouter } from "./routes";
import { attachSockets } from "./sockets";
import { startPersistenceWorker } from "./workers/persistence";

async function main() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  app.get("/", (_req, res) => res.json({ name: "TrackRunner API", ok: true }));
  app.use("/api", apiRouter);

  const server = http.createServer(app);
  const io = new IOServer(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    transports: ["websocket", "polling"],
  });
  attachSockets(io);

  startPersistenceWorker();

  server.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(`[server] listening on http://0.0.0.0:${config.port}`);
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[server] fatal:", err);
  process.exit(1);
});
