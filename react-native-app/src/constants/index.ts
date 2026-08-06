/**
 * Application-wide constants
 */

/**
 * Public Expo variables are compiled into the application.  They must never
 * contain a password, Supabase key, or other secret.
 */
const configuredApiOrigin = process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/+$/, '');

export const API_ORIGIN = configuredApiOrigin ?? '';
export const API_BASE_URL = API_ORIGIN ? `${API_ORIGIN}/api` : '';
export const SOCKET_URL = API_ORIGIN;

export function requireApiOrigin(): string {
  if (!API_ORIGIN) {
    throw new Error(
      'TrackRunner is not configured. Set EXPO_PUBLIC_API_BASE_URL in .env.local before starting the app.'
    );
  }
  return API_ORIGIN;
}

export const LOCATION_TASK_NAME = 'background-location-task';

export const LOCATION_UPDATE_INTERVAL_MS = 5000; // 5 seconds
export const LOCATION_DISTANCE_INTERVAL_M = 5; // 5 meters

export const STORAGE_KEYS = {
  AUTH_TOKEN: 'auth_token',
  USER_DATA: 'user_data',
  RUNNER_ID: 'runner_id',
} as const;

export const DB_NAME = 'trackrunner.db';
export const DB_VERSION = 1;
