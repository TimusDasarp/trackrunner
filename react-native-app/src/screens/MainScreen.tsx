import React, { useEffect } from 'react';
import {
  View,
  Text,
  Alert,
  Linking,
  Platform,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { ActivityIndicator, Button, Card, Chip } from 'react-native-paper';
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
    refreshPendingCount,
  } = useTracking();
  const { tasks, loading: tasksLoading, error: tasksError, refresh: refreshTasks, update: updateTask } = useTasks();

  async function handleLogout() {
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
  async function navigateToTask(task: RunnerTask) {
    const destination = task.destinationLat != null && task.destinationLon != null
      ? `${task.destinationLat},${task.destinationLon}`
      : task.clientAddress;
    const encodedDestination = encodeURIComponent(destination);
    const mapsFallback = `https://www.google.com/maps/dir/?api=1&destination=${encodedDestination}&travelmode=driving`;
    // `canOpenURL(geo:)` is unreliable on recent Android releases unless all
    // intent handlers are declared in the manifest. Open the Maps intent
    // directly, then fall back to the Maps web URL if no native handler exists.
    const nativeNavigation = Platform.OS === 'android'
      ? `google.navigation:q=${encodedDestination}&mode=d`
      : mapsFallback;
    try {
      await Linking.openURL(nativeNavigation);
    } catch {
      try {
        await Linking.openURL(mapsFallback);
      } catch {
        Alert.alert('Maps unavailable', 'Install or enable a maps app to navigate to this task.');
      }
    }
  }

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
          <Button mode="text" compact onPress={handleLogout}>Logout</Button>
        </View>

        <View className="flex-row gap-3 mb-6">
          <Card style={{ flex: 1 }} mode="contained"><Card.Content style={{ gap: 8 }}><Text className="text-xs font-medium text-slate-500">LOCATION</Text><Chip compact icon={isTracking ? 'map-marker-check' : 'progress-clock'}>{isTracking ? 'Active' : 'Starting…'}</Chip></Card.Content></Card>
          <Card style={{ flex: 1 }} mode="contained"><Card.Content style={{ gap: 8 }}><Text className="text-xs font-medium text-slate-500">LIVE CONNECTION</Text><Chip compact icon={isConnected ? 'cloud-check' : 'cloud-sync'}>{isConnected ? 'Online' : 'Reconnecting'}</Chip></Card.Content></Card>
        </View>

        {/* Live dispatcher tasks */}
        <View className="mb-6">
          <View className="flex-row items-center justify-between mb-2">
            <Text className="text-sm font-medium text-slate-500">ASSIGNED TASKS</Text>
            <Button mode="text" compact onPress={() => refreshTasks()}>Refresh</Button>
          </View>
          {tasksLoading ? <ActivityIndicator /> : tasksError ? (
            <Card mode="contained" style={{ backgroundColor: '#FEF2F2' }}><Card.Content><Text className="text-red-700">Could not load assigned tasks: {tasksError}</Text></Card.Content></Card>
          ) : tasks.length === 0 ? (
            <Card mode="contained"><Card.Content><Text className="text-slate-500">No active tasks assigned.</Text></Card.Content></Card>
          ) : tasks.map((task) => (
            <Card key={task.id} mode="elevated" style={{ marginBottom: 12 }}>
              <Card.Content style={{ gap: 8 }}>
                <Text className="text-lg font-bold text-slate-900">{task.clientName}</Text>
                <Chip compact style={{ alignSelf: 'flex-start' }}>{task.status.replace('_', ' ')}</Chip>
                <Text className="text-slate-700">{task.clientAddress}</Text>
                <Button mode="text" icon="navigation" compact onPress={() => navigateToTask(task)}>Navigate</Button>
                <Text className="text-blue-600 font-semibold">{task.clientPhone}</Text>
                {!!task.notes && <Text className="text-slate-600">{task.notes}</Text>}
                <Text className="text-xs font-semibold text-slate-500 mt-2">DOCUMENTS TO COLLECT</Text>
                {task.documents.map((doc) => <Chip key={doc.id} icon={doc.collected ? 'check-circle' : 'circle-outline'} selected={doc.collected} onPress={() => updateTask(task, task.status, task.documents.map((item) => item.id === doc.id ? { ...item, collected: !item.collected } : item))}>{doc.name}</Chip>)}
              </Card.Content>
              <Card.Actions><Button mode="contained" onPress={() => advanceTask(task)}>{taskButton(task.status)}</Button></Card.Actions>
            </Card>
          ))}
        </View>

        {/* Pending Locations */}
        <Card mode="contained" style={{ marginBottom: 24 }}><Card.Content><Text className="text-sm font-medium text-slate-500">PENDING LOCATIONS</Text><Text className="text-3xl font-bold text-slate-900 mt-2">{pendingCount}</Text><Text className="text-xs text-slate-500 mt-1">{pendingCount === 0 ? 'All synced' : 'Waiting to upload to server'}</Text></Card.Content></Card>

      </View>
    </ScrollView>
  );
}
