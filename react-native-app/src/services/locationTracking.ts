/**
 * Background location tracking service
 * Uses expo-location and expo-task-manager
 */

import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as Battery from 'expo-battery';
import { LOCATION_TASK_NAME, LOCATION_UPDATE_INTERVAL_MS, LOCATION_DISTANCE_INTERVAL_M } from '../constants';
import { LocationCache } from './locationCache';
import { socketClient } from './socketClient';
import { SyncService } from './syncService';
import type { LocationPoint } from '../types';

// Define the background task
TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error('[Background Task] Error:', error);
    return;
  }

  if (!data) return;

  const { locations } = data as { locations: Location.LocationObject[] };

  // Fetch current battery percentage
  let batteryLevel: number | undefined = undefined;
  try {
    const level = await Battery.getBatteryLevelAsync();
    if (level >= 0) {
      batteryLevel = Math.round(level * 100); // Convert fraction (e.g. 0.85) to percentage (85)
    }
  } catch (err) {
    // Ignore battery status reading errors
  }

  for (const location of locations) {
    const point: LocationPoint = {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      accuracy: location.coords.accuracy ?? undefined,
      altitude: location.coords.altitude ?? undefined,
      heading: location.coords.heading ?? undefined,
      speed: location.coords.speed ?? undefined,
      timestamp: location.timestamp,
      batteryLevel,
    };

    try {
      await LocationCache.saveLocation(point, false);
      if (!socketClient.isConnected()) {
        await socketClient.connect();
      }
      if (socketClient.isConnected()) {
        await SyncService.syncPendingLocations();
      }
    } catch (err) {
      console.warn('[Background Task] Location buffered for retry:', err);
    }
  }
});

export const LocationTracking = {
  async requestPermissions(): Promise<boolean> {
    const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
    if (foregroundStatus !== 'granted') {
      return false;
    }

    const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
    return backgroundStatus === 'granted';
  },

  async startTracking(): Promise<boolean> {
    const hasPermission = await this.requestPermissions();
    if (!hasPermission) {
      throw new Error('Location permission not granted');
    }

    // Ensure socket is connected when tracking starts
    if (!socketClient.isConnected()) {
      socketClient.connect().catch((err) => {
        console.warn('[Tracking] Socket connection failed on start:', err);
      });
    }

    const isRegistered = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
    if (isRegistered) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
    }

    await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
      accuracy: Location.Accuracy.High,
      timeInterval: LOCATION_UPDATE_INTERVAL_MS,
      distanceInterval: LOCATION_DISTANCE_INTERVAL_M,
      foregroundService: {
        notificationTitle: 'TrackRunner is active',
        notificationBody: 'Tracking your location in the background',
        notificationColor: '#0066CC',
      },
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
    });

    return true;
  },

  async stopTracking(): Promise<void> {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
    if (isRegistered) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
    }
  },

  async isTracking(): Promise<boolean> {
    return await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
  },

  async getCurrentLocation(): Promise<LocationPoint | null> {
    try {
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      let batteryLevel: number | undefined = undefined;
      try {
        const level = await Battery.getBatteryLevelAsync();
        if (level >= 0) {
          batteryLevel = Math.round(level * 100);
        }
      } catch (err) {
        // ignore
      }

      return {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy ?? undefined,
        altitude: location.coords.altitude ?? undefined,
        heading: location.coords.heading ?? undefined,
        speed: location.coords.speed ?? undefined,
        timestamp: location.timestamp,
        batteryLevel,
      };
    } catch (error) {
      console.error('[Location] Failed to get current location:', error);
      return null;
    }
  },
};
