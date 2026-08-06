import Redis from "ioredis";
import { config } from "../config";

export const redis = new Redis(config.redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
});

redis.on("error", (err) => {
  // eslint-disable-next-line no-console
  console.error("[redis] error:", err.message);
});

redis.on("connect", () => {
  // eslint-disable-next-line no-console
  console.log("[redis] connected");
});

// --- Key helpers ---
// runner:{id}:state  -> hash { lat, lon, accuracy, speed, bearing, altitude, battery, ts, updatedAt }
// runner:online      -> set of runner ids currently connected
// runners:all        -> set of all runner ids (for dashboard enumeration)
export const K = {
  state: (id: string | number) => `runner:${id}:state`,
  online: "runner:online",
  all: "runners:all",
};
