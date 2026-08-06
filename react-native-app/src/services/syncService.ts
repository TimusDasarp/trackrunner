/**
 * Sync pending locations from cache to server
 */

import { LocationCache } from './locationCache';
import { socketClient } from './socketClient';

export const SyncService = {
  async syncPendingLocations(): Promise<number> {
    const pending = await LocationCache.getUnsyncedLocations();
    if (pending.length === 0) return 0;

    if (socketClient.isConnected()) {
      try {
        const acceptedEventIds = await socketClient.emitLocationBatch(pending);
        await LocationCache.markSyncedByEventIds(acceptedEventIds);
        return acceptedEventIds.length;
      } catch (err) {
        console.error('[Sync] Socket batch sync failed:', err);
      }
    } else {
      console.warn('[Sync] Cannot sync: Socket is not connected');
    }

    return 0;
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
      console.error('[Sync] Automatic cache flush failed:', err);
    });
  }
});
