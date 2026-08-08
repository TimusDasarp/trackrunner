/**
 * Socket.IO client for real-time location sync
 */

import { io, Socket } from 'socket.io-client';
import { requireApiOrigin, SOCKET_URL } from '../constants';
import { SessionStore } from './sessionStore';
import type { LocationPoint } from '../types';

export interface LocationPayload {
  eventId: string;
  runnerId: string;
  lat: number;
  lon: number;
  accuracy: number | null;
  speed: number | null;
  bearing: number | null;
  altitude: number | null;
  battery: number | null;
  ts: number;
}

interface LocationAck {
  ok: boolean;
  acceptedEventIds?: string[];
  error?: string;
}

interface TrackingStatusAck {
  ok: boolean;
  error?: string;
}

type SocketConnectionListener = (connected: boolean) => void;

class SocketClient {
  private socket: Socket | null = null;
  private connected = false;
  private runnerId: string | null = null;
  private listeners = new Set<SocketConnectionListener>();
  private connectionPromise: Promise<void> | null = null;
  private trackingActive: boolean | null = null;

  async connect(): Promise<void> {
    if (this.socket?.connected) return;
    if (this.connectionPromise) return this.connectionPromise;
    requireApiOrigin();

    const token = await SessionStore.getToken();
    if (!token) {
      throw new Error('No auth token available');
    }

    const user = await SessionStore.getUser();
    this.runnerId = user?.id || null;

    this.connectionPromise = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Socket connection timed out')), 10_000);
      const socket = io(SOCKET_URL, {
        path: '/socket.io',
        auth: { token },
        // Start with the transport that we have verified through Render's
        // proxy. Socket.IO upgrades this polling connection to WebSocket when
        // possible, but location delivery remains available when it is not.
        transports: ['polling', 'websocket'],
        tryAllTransports: true,
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
      });
      this.socket = socket;

      socket.on('connect', () => {
        console.log('[Socket] Connected via', socket.io.engine.transport.name);
        this.connected = true;
        this.notifyListeners();
        if (this.trackingActive !== null) {
          this.emitTrackingStatus(this.trackingActive).catch((err) => {
            console.warn('[Socket] Could not restore tracking status:', err);
          });
        }
        clearTimeout(timeout);
        resolve();
      });

      socket.on('disconnect', (reason) => {
        console.log('[Socket] Disconnected:', reason);
        this.connected = false;
        this.notifyListeners();
      });

      socket.on('connect_error', (error) => {
        console.error('[Socket] Connection error:', error.message);
        if (!this.connected) {
          clearTimeout(timeout);
          reject(new Error(error.message || 'Socket connection failed'));
        }
      });
    });

    try {
      await this.connectionPromise;
    } finally {
      this.connectionPromise = null;
    }
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.connected = false;
      this.connectionPromise = null;
      this.notifyListeners();
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  async setTrackingActive(active: boolean): Promise<void> {
    this.trackingActive = active;
    if (!this.socket?.connected) return;
    await this.emitTrackingStatus(active);
  }

  private async emitTrackingStatus(active: boolean): Promise<void> {
    if (!this.socket?.connected) return;
    const response = await this.socket
      .timeout(10_000)
      .emitWithAck('runner:tracking', { active }) as TrackingStatusAck;
    if (!response?.ok) throw new Error(response?.error ?? 'Tracking status was not accepted');
  }

  addConnectionListener(listener: SocketConnectionListener): void {
    this.listeners.add(listener);
    // Callback immediately with current state
    listener(this.connected);
  }

  removeConnectionListener(listener: SocketConnectionListener): void {
    this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.connected);
      } catch (err) {
        console.error('[Socket] Listener notification failed:', err);
      }
    }
  }

  private mapToPayload(location: LocationPoint): LocationPayload {
    if (!location.eventId) throw new Error('Location eventId is required');
    return {
      eventId: location.eventId,
      runnerId: this.runnerId || 'unknown-runner',
      lat: location.latitude,
      lon: location.longitude,
      accuracy: location.accuracy ?? null,
      speed: location.speed ?? null,
      bearing: location.heading ?? null, // Map heading in JS to bearing
      altitude: location.altitude ?? null,
      battery: location.batteryLevel !== undefined && location.batteryLevel !== null
        ? Math.round(location.batteryLevel)
        : null,
      ts: location.timestamp,
    };
  }

  async emitLocationBatch(locations: LocationPoint[]): Promise<string[]> {
    if (!this.socket?.connected) throw new Error('Socket is not connected');
    if (locations.length === 0) return [];
    const response = await this.socket
      .timeout(10_000)
      .emitWithAck('runner:location:batch', locations.map((location) => this.mapToPayload(location))) as LocationAck;
    if (!response?.ok) throw new Error(response?.error ?? 'Location batch was not accepted');
    return response.acceptedEventIds ?? [];
  }

  on(event: string, handler: (...args: any[]) => void): void {
    this.socket?.on(event, handler);
  }

  off(event: string, handler?: (...args: any[]) => void): void {
    if (handler) {
      this.socket?.off(event, handler);
    } else {
      this.socket?.removeAllListeners(event);
    }
  }
}

export const socketClient = new SocketClient();
