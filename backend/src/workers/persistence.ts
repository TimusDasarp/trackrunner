import { pool } from "../db/pool";
import { redis, K } from "../services/redis";
import { config } from "../config";

/**
 * Periodically flush the latest location per runner from Redis into Postgres
 * for historical / audit purposes. Runs every FLUSH_INTERVAL_MS.
 */
export function startPersistenceWorker() {
  const tick = async () => {
    try {
      const ids = await redis.smembers(K.all);
      if (ids.length === 0) return;

      const pipeline = redis.pipeline();
      ids.forEach((id) => pipeline.hgetall(K.state(id)));
      const results = await pipeline.exec();
      if (!results) return;

      const rows: any[] = [];
      ids.forEach((id, i) => {
        const [err, data] = results[i];
        if (err || !data) return;
        const d = data as Record<string, string>;
        if (!d.lat || !d.lon || !d.ts) return;
        rows.push([
          Number(id),
          Number(d.lat),
          Number(d.lon),
          d.accuracy ? Number(d.accuracy) : null,
          d.speed ? Number(d.speed) : null,
          d.bearing ? Number(d.bearing) : null,
          d.altitude ? Number(d.altitude) : null,
          d.battery ? Number(d.battery) : null,
          Number(d.ts),
        ]);
      });

      if (rows.length === 0) return;

      // ON CONFLICT DO NOTHING via (runner_id, ts) uniqueness would be ideal,
      // but we don't have a unique index — instead we just append. The dashboard
      // only cares about the latest state from Redis.
      const sql = `
        INSERT INTO location_history
          (runner_id, lat, lon, accuracy, speed, bearing, altitude, battery, ts)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      `;
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        for (const r of rows) {
          await client.query(sql, r);
        }
        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[worker] flush failed:", err);
    }
  };

  setInterval(tick, config.flushIntervalMs);
  // eslint-disable-next-line no-console
  console.log(`[worker] persistence flush every ${config.flushIntervalMs}ms`);
}
