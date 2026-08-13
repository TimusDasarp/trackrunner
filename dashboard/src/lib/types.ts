export interface User {
  id: string;
  email: string;
  assignmentActive?: boolean;
  role: "runner" | "dispatcher";
  displayName: string;
}

export interface LocationUpdate {
  runnerId: string;
  lat: number;
  lon: number;
  accuracy?: number | null;
  speed?: number | null;
  bearing?: number | null;
  altitude?: number | null;
  battery?: number | null;
  ts: number;
}

export interface RunnerState {
  runnerId: string;
  displayName: string;
  email: string;
  assignmentActive?: boolean;
  online: boolean;
  trackingActive: boolean;
  status: RunnerStatus;
  hasLocation: boolean;
  lat?: number;
  lon?: number;
  accuracy?: number | null;
  speed?: number | null;
  bearing?: number | null;
  altitude?: number | null;
  battery?: number | null;
  ts?: number;
}

export type RunnerStatus = "live" | "stale" | "idle" | "offline";

const FRESH_LOCATION_WINDOW_MS = 90_000;

/** A socket connection alone is not a live tracking signal. */
export function getRunnerStatus(runner: RunnerState, now = Date.now()): RunnerStatus {
  if (runner.trackingActive) {
    return runner.ts && now - runner.ts <= FRESH_LOCATION_WINDOW_MS ? "live" : "stale";
  }
  return runner.online ? "idle" : "offline";
}
