import { redis, K } from "./redis";
import type { LocationPayload } from "./schemas";

/**
 * Persist a single location update to Redis.
 * Uses a hash so dashboards can fetch the latest state in one round-trip.
 */
export async function saveLocation(p: LocationPayload): Promise<void> {
  const key = K.state(p.runnerId);
  const fields: Record<string, string> = {
    runnerId: String(p.runnerId),
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
