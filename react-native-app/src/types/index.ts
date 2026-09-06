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

export type TaskStatus = 'unassigned' | 'sent' | 'acknowledged' | 'in_progress' | 'completed' | 'unable_to_complete';
export type IncompleteReason =
  | 'client_unavailable'
  | 'client_requested_reschedule'
  | 'address_issue'
  | 'access_denied'
  | 'runner_issue'
  | 'vehicle_or_device_issue'
  | 'safety_issue'
  | 'other';
export interface RunnerTaskDocument { id: string; name: string; collected: boolean; collectedAt?: string | null; }
export interface TaskAttachment {
  id: string;
  name: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
}
export interface RunnerTask {
  id: string; runnerId: string; createdByOperatorId?: string | null; createdByOperatorName?: string | null; clientName: string; clientAddress: string; clientPhone: string;
  notes?: string | null; destinationLat?: number | null; destinationLon?: number | null; priority?: 'normal' | 'high' | 'urgent' | 'low'; dueAt?: string | null; status: TaskStatus; createdAt: string; incompleteReason?: IncompleteReason | null; incompleteNote?: string | null; documents: RunnerTaskDocument[];
}
