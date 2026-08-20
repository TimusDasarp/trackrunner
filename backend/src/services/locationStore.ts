import { redis, K } from "./redis";
import type { LocationPayload } from "./schemas";
import { pool } from "../db/pool";

export async function persistLocations(points: LocationPayload[]): Promise<string[]> {
  if (points.length === 0) return [];
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // One query per point made an offline flush of a few hundred locations
    // exceed the Socket.IO acknowledgement timeout. Insert the complete batch
    // atomically instead; event IDs keep retries idempotent.
    await client.query(
      `INSERT INTO location_history
        (runner_id, lat, lon, accuracy, speed, bearing, altitude, battery, event_id, ts)
       SELECT * FROM UNNEST(
         $1::integer[], $2::double precision[], $3::double precision[],
         $4::real[], $5::real[], $6::real[], $7::real[], $8::real[],
         $9::text[], $10::bigint[]
       )
       ON CONFLICT (runner_id, event_id) WHERE event_id IS NOT NULL DO NOTHING`,
      [
        points.map((point) => Number(point.runnerId)),
        points.map((point) => point.lat),
        points.map((point) => point.lon),
        points.map((point) => point.accuracy ?? null),
        points.map((point) => point.speed ?? null),
        points.map((point) => point.bearing ?? null),
        points.map((point) => point.altitude ?? null),
        points.map((point) => point.battery ?? null),
        points.map((point) => point.eventId),
        points.map((point) => point.ts),
      ]
    );
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
    // Receiving a location is definitive evidence that tracking is active.
    // This also keeps dashboard status accurate for a runner using an older
    // app version that does not yet send explicit tracking-status events.
    trackingActive: "true",
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

/** Store tracking intent separately from the socket connection state. */
export async function setTrackingActive(runnerId: string, active: boolean) {
  await redis
    .multi()
    .hset(K.state(runnerId), {
      runnerId,
      trackingActive: String(active),
      trackingUpdatedAt: String(Date.now()),
    })
    .sadd(K.all, runnerId)
    .exec();
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
