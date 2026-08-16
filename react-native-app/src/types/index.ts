/**
 * Type definitions for the app
 */

export interface User {
  id: string;
  email: string;
  role: 'runner' | 'dispatcher' | 'admin';
  displayName?: string | null;
  organizationId: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface LocationPoint {
  eventId?: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
  altitude?: number;
  heading?: number;
  speed?: number;
  timestamp: number;
  batteryLevel?: number;
}

export interface CachedLocation extends LocationPoint {
  id?: number;
  synced: boolean;
  createdAt: number;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface TrackingState {
  isTracking: boolean;
  isAuthenticated: boolean;
  lastLocation: LocationPoint | null;
  pendingCount: number;
}

export type TaskStatus = 'sent' | 'acknowledged' | 'in_progress' | 'completed' | 'unable_to_complete';
export interface RunnerTaskDocument { id: string; name: string; collected: boolean; collectedAt?: string | null; }
export interface RunnerTask {
  id: string; runnerId: string; clientName: string; clientAddress: string; clientPhone: string;
  notes?: string | null; destinationLat?: number | null; destinationLon?: number | null; priority?: 'normal' | 'high' | 'urgent' | 'low'; status: TaskStatus; createdAt: string; documents: RunnerTaskDocument[];
}
