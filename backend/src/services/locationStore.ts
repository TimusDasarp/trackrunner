import { redis, K } from "./redis";
import type { LocationPayload } from "./schemas";
import { pool } from "../db/pool";

export async function persistLocations(points: LocationPayload[]): Promise<string[]> {
  if (points.length === 0) return [];
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const point of points) {
      await client.query(
        `INSERT INTO location_history
          (runner_id, lat, lon, accuracy, speed, bearing, altitude, battery, event_id, ts)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (runner_id, event_id) WHERE event_id IS NOT NULL DO NOTHING`,
        [
          Number(point.runnerId), point.lat, point.lon, point.accuracy ?? null,
          point.speed ?? null, point.bearing ?? null, point.altitude ?? null,
          point.battery ?? null, point.eventId, point.ts,
        ]
      );
    }
    await client.query("COMMIT");
    return points.map((point) => point.eventId);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Persist a single location update to Redis.
 * Uses a hash so dashboards can fetch the latest state in one round-trip.
 */
export async function saveLocation(p: LocationPayload, organizationId: string): Promise<void> {
  const key = K.state(p.runnerId);
  const fields: Record<string, string> = {
    runnerId: String(p.runnerId),
    organizationId,
    lat: String(p.lat),
    lon: String(p.lon),
    ts: String(p.ts),
    updatedAt: String(Date.now()),
  };
  if (p.accuracy != null) fields.accuracy = String(p.accuracy);
  if (p.speed != null) fields.speed = String(p.speed);
  if (p.bearing != null) fields.bearing = String(p.bearing);
  if (p.altitude != null) fields.altitude = String(p.altitude);
  if (p.battery != null) fields.battery = String(p.battery);

  await redis
    .multi()
    .hset(key, fields)
    .sadd(K.all, String(p.runnerId))
    .exec();
}

export async function getRunnerState(runnerId: string) {
  const data = await redis.hgetall(K.state(runnerId));
  if (!data || Object.keys(data).length === 0) return null;
  return data;
}

export async function getAllRunnerStates(): Promise<Record<string, any>> {
  const ids = await redis.smembers(K.all);
  if (ids.length === 0) return {};
  const pipeline = redis.pipeline();
  ids.forEach((id) => pipeline.hgetall(K.state(id)));
  const results = await pipeline.exec();
  const out: Record<string, any> = {};
  ids.forEach((id, i) => {
    const [err, data] = results![i];
    if (!err && data && Object.keys(data as object).length > 0) {
      out[id] = data;
    }
  });
  return out;
}

export async function markOnline(runnerId: string) {
  await redis.sadd(K.online, runnerId);
  await redis.sadd(K.all, runnerId);
}

export async function markOffline(runnerId: string) {
  await redis.srem(K.online, runnerId);
}

export async function getOnlineRunners(): Promise<string[]> {
  return redis.smembers(K.online);
}

/** Remove a runner's retained trail and current map state without deleting the account. */
export async function clearRunnerLocationData(runnerId: string): Promise<number> {
  const result = await pool.query(
    "DELETE FROM location_history WHERE runner_id = $1",
    [runnerId]
  );
  await redis
    .multi()
    .del(K.state(runnerId))
    .srem(K.all, runnerId)
    .srem(K.online, runnerId)
    .exec();
  return result.rowCount ?? 0;
}
