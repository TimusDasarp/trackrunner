import React, { useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { useAuth } from '../hooks/useAuth';
import { useTracking } from '../hooks/useTracking';

export default function MainScreen() {
  const { user, logout } = useAuth();
  const {
    isTracking,
    pendingCount,
    isConnected,
    startTracking,
    stopTracking,
    syncNow,
    refreshPendingCount,
  } = useTracking();

  async function handleToggleTracking() {
    try {
      if (isTracking) {
        await stopTracking();
        Alert.alert('Stopped', 'Location tracking has been stopped');
      } else {
        await startTracking();
        Alert.alert('Started', 'Location tracking is now active');
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to toggle tracking');
    }
  }

  async function handleSync() {
    const synced = await syncNow();
    if (synced > 0) {
      Alert.alert('Synced', `${synced} location(s) uploaded successfully`);
    } else {
      Alert.alert('Up to date', 'No pending locations to sync');
    }
  }

  async function handleLogout() {
    if (isTracking) {
      Alert.alert(
        'Tracking Active',
        'Please stop tracking before logging out',
        [{ text: 'OK' }]
      );
      return;
    }
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: () => logout() },
    ]);
  }

  return (
    <ScrollView
      className="flex-1 bg-slate-50"
      refreshControl={
        <RefreshControl
          refreshing={false}
          onRefresh={refreshPendingCount}
        />
      }
    >
      <View className="px-6 pt-12 pb-6">
        <View className="flex-row justify-between items-center mb-8">
          <View>
            <Text className="text-2xl font-bold text-slate-900">
              Welcome back
            </Text>
            <Text className="text-sm text-slate-600 mt-1">
              {user?.email}
            </Text>
          </View>
          <TouchableOpacity onPress={handleLogout}>
            <Text className="text-blue-600 font-medium">Logout</Text>
          </TouchableOpacity>
        </View>

        {/* Status Card */}
        <View className="bg-white rounded-2xl p-6 mb-4 shadow-sm">
          <Text className="text-sm font-medium text-slate-500 mb-2">
            TRACKING STATUS
          </Text>
          <View className="flex-row items-center">
            <View
              className={`w-3 h-3 rounded-full mr-3 ${
                isTracking ? 'bg-green-500' : 'bg-slate-300'
              }`}
            />
            <Text className="text-xl font-semibold text-slate-900">
              {isTracking ? 'Active' : 'Inactive'}
            </Text>
          </View>
        </View>

        {/* Connection Status */}
        <View className="bg-white rounded-2xl p-6 mb-4 shadow-sm">
          <Text className="text-sm font-medium text-slate-500 mb-2">
            CONNECTION
          </Text>
          <View className="flex-row items-center">
            <View
              className={`w-3 h-3 rounded-full mr-3 ${
                isConnected ? 'bg-green-500' : 'bg-amber-500'
              }`}
            />
            <Text className="text-base text-slate-900">
              {isConnected ? 'Connected to server' : 'Offline mode'}
            </Text>
          </View>
        </View>

        {/* Pending Locations */}
        <View className="bg-white rounded-2xl p-6 mb-6 shadow-sm">
          <Text className="text-sm font-medium text-slate-500 mb-2">
            PENDING LOCATIONS
          </Text>
          <Text className="text-3xl font-bold text-slate-900">
            {pendingCount}
          </Text>
          <Text className="text-xs text-slate-500 mt-1">
            {pendingCount === 0
              ? 'All synced'
              : 'Waiting to upload to server'}
          </Text>
        </View>

        {/* Action Buttons */}
        <TouchableOpacity
          className={`rounded-2xl py-5 items-center mb-3 ${
            isTracking ? 'bg-red-500' : 'bg-blue-600'
          }`}
          onPress={handleToggleTracking}
        >
          <Text className="text-white font-semibold text-lg">
            {isTracking ? 'Stop Tracking' : 'Start Tracking'}
          </Text>
        </TouchableOpacity>

        {pendingCount > 0 && (
          <TouchableOpacity
            className="bg-white border-2 border-blue-600 rounded-2xl py-4 items-center"
            onPress={handleSync}
          >
            <Text className="text-blue-600 font-semibold text-base">
              Sync Now ({pendingCount})
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );
}
