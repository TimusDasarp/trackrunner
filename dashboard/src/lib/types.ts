export interface User {
  id: string;
  email: string;
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

export interface RunnerState extends LocationUpdate {
  online: boolean;
}
