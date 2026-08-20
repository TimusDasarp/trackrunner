/**
 * SQLite database for offline location caching
 * Uses expo-sqlite
 */

import * as SQLite from 'expo-sqlite';
import * as Crypto from 'expo-crypto';
import { DB_NAME } from '../constants';
import type { CachedLocation, LocationPoint } from '../types';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const database = await SQLite.openDatabaseAsync(DB_NAME);
      await initSchema(database);
      return database;
    })();
  }
  try {
    return await dbPromise;
  } catch (error) {
    // Do not retain a failed native database handle. A later tracking task can
    // reopen it instead of repeatedly receiving the same prepareAsync failure.
    dbPromise = null;
    throw error;
  }
}

async function initSchema(database: SQLite.SQLiteDatabase): Promise<void> {
  await database.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS locations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      accuracy REAL,
      altitude REAL,
      heading REAL,
      speed REAL,
      timestamp INTEGER NOT NULL,
      battery_level REAL,
      event_id TEXT,
      synced INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_synced ON locations(synced);
    CREATE INDEX IF NOT EXISTS idx_timestamp ON locations(timestamp);
  `);
  const columns = await database.getAllAsync<{ name: string }>("PRAGMA table_info(locations)");
  if (!columns.some((column) => column.name === "event_id")) {
    await database.execAsync("ALTER TABLE locations ADD COLUMN event_id TEXT");
  }
  await database.execAsync(
    "UPDATE locations SET event_id = lower(hex(randomblob(16))) WHERE event_id IS NULL"
  );
  await database.execAsync("CREATE UNIQUE INDEX IF NOT EXISTS uq_locations_event_id ON locations(event_id)");
}

export const LocationCache = {
  async saveLocation(location: LocationPoint, synced = false): Promise<void> {
    const database = await getDb();
    await database.runAsync(
      `INSERT INTO locations
       (latitude, longitude, accuracy, altitude, heading, speed, timestamp, battery_level, event_id, synced, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)` ,
      location.latitude,
      location.longitude,
      location.accuracy ?? null,
      location.altitude ?? null,
      location.heading ?? null,
      location.speed ?? null,
      location.timestamp,
      location.batteryLevel ?? null,
      location.eventId ?? Crypto.randomUUID(),
      synced ? 1 : 0,
      Date.now()
    );
  },

  async getUnsyncedLocations(): Promise<CachedLocation[]> {
    const database = await getDb();
    const rows = await database.getAllAsync<any>(
      `SELECT * FROM locations WHERE synced = 0 ORDER BY timestamp ASC`
    );
    return rows.map((row) => ({
      id: row.id,
      latitude: row.latitude,
      longitude: row.longitude,
      accuracy: row.accuracy,
      altitude: row.altitude,
      heading: row.heading,
      speed: row.speed,
      timestamp: row.timestamp,
      batteryLevel: row.battery_level,
      eventId: row.event_id,
      synced: row.synced === 1,
      createdAt: row.created_at,
    }));
  },

  async markSynced(ids: number[]): Promise<void> {
    if (ids.length === 0) return;
    const database = await getDb();
    const placeholders = ids.map(() => '?').join(',');
    await database.runAsync(
      `UPDATE locations SET synced = 1 WHERE id IN (${placeholders})`,
      ...ids
    );
  },

  async markSyncedByEventIds(eventIds: string[]): Promise<void> {
    if (eventIds.length === 0) return;
    const database = await getDb();
    const placeholders = eventIds.map(() => '?').join(',');
    await database.runAsync(
      `UPDATE locations SET synced = 1 WHERE event_id IN (${placeholders})`,
      ...eventIds
    );
  },

  async getUnsyncedCount(): Promise<number> {
    const database = await getDb();
    const result = await database.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) as count FROM locations WHERE synced = 0`
    );
    return result?.count ?? 0;
  },

  async clearAll(): Promise<void> {
    const database = await getDb();
    await database.runAsync(`DELETE FROM locations`);
  },
};
