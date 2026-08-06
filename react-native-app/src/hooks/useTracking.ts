/**
 * Hook for managing location tracking state
 */

import { useEffect, useState, useCallback } from 'react';
import { LocationTracking } from '../services/locationTracking';
import { SyncService } from '../services/syncService';
import { socketClient } from '../services/socketClient';
import type { LocationPoint } from '../types';

export function useTracking() {
  const [isTracking, setIsTracking] = useState(false);
  const [lastLocation, setLastLocation] = useState<LocationPoint | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    checkStatus();

    // Subscribe to dynamic socket connection state changes
    const onConnectionChange = (connected: boolean) => {
      setIsConnected(connected);
      refreshPendingCount();
    };
    socketClient.addConnectionListener(onConnectionChange);

    const interval = setInterval(refreshPendingCount, 5000);

    return () => {
      socketClient.removeConnectionListener(onConnectionChange);
      clearInterval(interval);
    };
  }, []);

  async function checkStatus() {
    const tracking = await LocationTracking.isTracking();
    setIsTracking(tracking);
    setIsConnected(socketClient.isConnected());
    await refreshPendingCount();
  }

  async function refreshPendingCount() {
    const count = await SyncService.getPendingCount();
    setPendingCount(count);
  }

  const startTracking = useCallback(async () => {
    try {
      await LocationTracking.startTracking();
      setIsTracking(true);
    } catch (err) {
      console.error('[Tracking] Start failed:', err);
      throw err;
    }
  }, []);

  const stopTracking = useCallback(async () => {
    try {
      await LocationTracking.stopTracking();
      setIsTracking(false);
    } catch (err) {
      console.error('[Tracking] Stop failed:', err);
      throw err;
    }
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
    startTracking,
    stopTracking,
    syncNow,
    refreshPendingCount,
  };
}
