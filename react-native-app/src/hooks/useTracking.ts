/**
 * Hook for managing location tracking state
 */

import { useEffect, useState, useCallback } from 'react';
import { AppState } from 'react-native';
import { LocationTracking } from '../services/locationTracking';
import { SyncService } from '../services/syncService';
import { socketClient } from '../services/socketClient';
import type { LocationPoint } from '../types';

export function useTracking() {
  const [isTracking, setIsTracking] = useState(false);
  const [lastLocation, setLastLocation] = useState<LocationPoint | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [isConnected, setIsConnected] = useState(false);

  async function refreshPendingCount() {
    const count = await SyncService.getPendingCount();
    setPendingCount(count);
  }

  const startAutomatically = useCallback(async () => {
    await LocationTracking.startTracking();
    setIsTracking(true);
    setIsConnected(socketClient.isConnected());
    await refreshPendingCount();
  }, []);

  useEffect(() => {
    let active = true;
    const initialiseTracking = async () => {
      try {
        const tracking = await LocationTracking.isTracking();
        if (!tracking) await startAutomatically();
        else {
          await socketClient.setTrackingActive(true);
          if (active) setIsTracking(true);
        }
      } catch (err) {
        console.warn('[Tracking] Automatic start failed:', err);
      } finally {
        if (active) setIsConnected(socketClient.isConnected());
        await refreshPendingCount();
      }
    };
    void initialiseTracking();

    // Subscribe to dynamic socket connection state changes
    const onConnectionChange = (connected: boolean) => {
      setIsConnected(connected);
      refreshPendingCount();
    };
    socketClient.addConnectionListener(onConnectionChange);

    const interval = setInterval(refreshPendingCount, 5000);

    return () => {
      active = false;
      socketClient.removeConnectionListener(onConnectionChange);
      clearInterval(interval);
    };
  }, [startAutomatically]);

  useEffect(() => {
    let running = false;
    const sendForegroundFix = async () => {
      if (running || AppState.currentState !== 'active') return;
      running = true;
      try {
        await LocationTracking.captureAndSyncCurrentLocation();
      } catch (err) {
        console.warn('[Tracking] Foreground GPS sync failed:', err);
      } finally {
        running = false;
        await refreshPendingCount();
      }
    };

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void sendForegroundFix();
    });
    void sendForegroundFix();
    const interval = setInterval(() => void sendForegroundFix(), 30_000);
    return () => {
      subscription.remove();
      clearInterval(interval);
    };
  }, []);

  const syncNow = useCallback(async () => {
    const synced = await SyncService.syncPendingLocations();
    await refreshPendingCount();
    return synced;
  }, []);

  return {
    isTracking,
    lastLocation,
    pendingCount,
    isConnected,
    syncNow,
    refreshPendingCount,
  };
}
