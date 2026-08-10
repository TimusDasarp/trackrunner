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
import { useTasks } from '../hooks/useTasks';
import type { RunnerTask } from '../types';

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
  const { tasks, loading: tasksLoading, refresh: refreshTasks, update: updateTask } = useTasks();

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

  async function advanceTask(task: RunnerTask) {
    const next = task.status === 'sent' ? 'acknowledged' : task.status === 'acknowledged' ? 'in_progress' : 'completed';
    try { await updateTask(task, next); }
    catch (error: any) { Alert.alert('Could not update task', error?.message || 'Please try again'); }
  }

  const taskButton = (status: RunnerTask['status']) => status === 'sent' ? 'Acknowledge task' : status === 'acknowledged' ? 'Start task' : 'Mark completed';

  return (
    <ScrollView
      className="flex-1 bg-slate-50"
      refreshControl={
        <RefreshControl
          refreshing={false}
          onRefresh={() => { refreshPendingCount(); refreshTasks(); }}
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

        {/* Live dispatcher tasks */}
        <View className="mb-6">
          <View className="flex-row items-center justify-between mb-2">
            <Text className="text-sm font-medium text-slate-500">ASSIGNED TASKS</Text>
            <TouchableOpacity onPress={() => refreshTasks()}><Text className="text-blue-600 font-medium">Refresh</Text></TouchableOpacity>
          </View>
          {tasksLoading ? <Text className="text-slate-500">Loading tasks…</Text> : tasks.length === 0 ? (
            <View className="bg-white rounded-2xl p-5 shadow-sm"><Text className="text-slate-500">No active tasks assigned.</Text></View>
          ) : tasks.map((task) => (
            <View key={task.id} className="bg-white rounded-2xl p-5 mb-3 shadow-sm border border-blue-100">
              <View className="flex-row items-start justify-between gap-2"><View className="flex-1"><Text className="text-lg font-bold text-slate-900">{task.clientName}</Text><Text className="text-xs text-blue-700 uppercase font-semibold mt-1">{task.status.replace('_', ' ')}</Text></View></View>
              <Text className="text-slate-700 mt-3">{task.clientAddress}</Text>
              <Text className="text-blue-600 font-semibold mt-1">{task.clientPhone}</Text>
              {!!task.notes && <Text className="text-slate-600 mt-3">{task.notes}</Text>}
              <Text className="text-xs font-semibold text-slate-500 mt-4 mb-2">DOCUMENTS TO COLLECT</Text>
              {task.documents.map((doc) => <TouchableOpacity key={doc.id} className="flex-row items-center py-1" onPress={() => updateTask(task, task.status, task.documents.map((item) => item.id === doc.id ? { ...item, collected: !item.collected } : item))}><Text className={`mr-2 text-base ${doc.collected ? 'text-green-600' : 'text-slate-400'}`}>{doc.collected ? '✓' : '○'}</Text><Text className={doc.collected ? 'text-slate-400 line-through' : 'text-slate-800'}>{doc.name}</Text></TouchableOpacity>)}
              <TouchableOpacity className="bg-blue-600 rounded-xl py-3 items-center mt-4" onPress={() => advanceTask(task)}><Text className="text-white font-semibold">{taskButton(task.status)}</Text></TouchableOpacity>
            </View>
          ))}
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
