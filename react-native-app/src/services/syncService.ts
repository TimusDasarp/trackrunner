/**
 * Sync pending locations from cache to server
 */

import { LocationCache } from './locationCache';
import { socketClient } from './socketClient';

// Keep acknowledgements quick even after a device has been offline for hours.
const SYNC_BATCH_SIZE = 100;
let syncInFlight: Promise<number> | null = null;

async function flushPendingLocations(): Promise<number> {
  const pending = await LocationCache.getUnsyncedLocations();
  if (pending.length === 0) return 0;

  if (!socketClient.isConnected()) {
    console.warn('[Sync] Cannot sync: Socket is not connected');
    return 0;
  }

  let synced = 0;
  for (let offset = 0; offset < pending.length; offset += SYNC_BATCH_SIZE) {
    const batch = pending.slice(offset, offset + SYNC_BATCH_SIZE);
    try {
      const acceptedEventIds = await socketClient.emitLocationBatch(batch);
      await LocationCache.markSyncedByEventIds(acceptedEventIds);
      synced += acceptedEventIds.length;
    } catch (err) {
      // Upload failures are expected while the service is recovering. The
      // remaining cache is retained and retried without disturbing the user.
      if (__DEV__) console.log('[Sync] Batch upload deferred; will retry.', err);
      break;
    }
  }

  return synced;
}

export const SyncService = {
  async syncPendingLocations(): Promise<number> {
    // Location callbacks may overlap when Android wakes the background task.
    // Serialize flushes so the same queue is not uploaded repeatedly.
    if (syncInFlight) return syncInFlight;
    syncInFlight = flushPendingLocations();
    try {
      return await syncInFlight;
    } finally {
      syncInFlight = null;
    }
  },

  async getPendingCount(): Promise<number> {
    return await LocationCache.getUnsyncedCount();
  },
};

// Subscribe to socket connection events to trigger automatic cache flush
socketClient.addConnectionListener((connected) => {
  if (connected) {
    console.log('[Sync] Socket connection restored, starting automatic cache flush...');
    SyncService.syncPendingLocations().catch((err) => {
      if (__DEV__) console.log('[Sync] Automatic cache flush deferred; will retry.', err);
    });
  }
});
