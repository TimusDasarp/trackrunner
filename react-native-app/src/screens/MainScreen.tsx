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
import { ActivityIndicator, Button, Card, Chip, IconButton } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../hooks/useAuth';
import { useTracking } from '../hooks/useTracking';
import { useTasks } from '../hooks/useTasks';
import type { RunnerTask } from '../types';

export default function MainScreen() {
  const navigation = useNavigation<any>();
  const { user, logout } = useAuth();
  const {
    isTracking,
    pendingCount,
    isConnected,
    permissionState,
    enableBackgroundTracking,
    refreshPendingCount,
  } = useTracking();
  const { tasks, loading: tasksLoading, error: tasksError, refresh: refreshTasks } = useTasks();
  const priorityMeta = (priority?: RunnerTask['priority']) => priority === 'urgent'
    ? { label: 'URGENT', border: '#DC2626', chip: '#FEE2E2' }
    : priority === 'high'
      ? { label: 'HIGH', border: '#F59E0B', chip: '#FEF3C7' }
      : { label: 'NORMAL', border: '#94A3B8', chip: '#F1F5F9' };
  const prioritizedTasks = [...tasks].sort((a, b) => {
    const rank = (priority?: RunnerTask['priority']) => priority === 'urgent' ? 0 : priority === 'high' ? 1 : 2;
    return rank(a.priority) - rank(b.priority);
  });

  async function handleLogout() {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: () => logout() },
    ]);
  }

  async function handleEnableBackgroundTracking() {
    const explainAndStart = async () => {
      try {
        const permission = await enableBackgroundTracking();
        if (permission !== 'background') {
          Alert.alert(
            'Background tracking is off',
            'Location will update only while TrackRunner is open. In Android Settings, choose “Allow all the time” to keep dispatch updated during deliveries.'
          );
        }
      } catch (error: any) {
        Alert.alert('Location permission needed', error?.message || 'Allow location access to use delivery tracking.');
      }
    };

    if (Platform.OS === 'android') {
      Alert.alert(
        'Keep delivery tracking active',
        'Choose “Allow all the time” in Android Settings. This keeps your live location available while you use maps or put the app in the background.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Continue', onPress: () => { void explainAndStart(); } },
        ]
      );
      return;
    }
    await explainAndStart();
  }

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
        <View className="flex-row justify-between items-center mb-7">
          <Text className="text-4xl font-bold text-slate-900">Tasks</Text>
          <IconButton icon="logout" mode="contained" size={24} onPress={handleLogout} accessibilityLabel="Logout" />
        </View>

        <Card mode="contained" style={{ marginBottom: 28 }}>
          <Card.Content style={{ gap: 20 }}>
            <View className="flex-row items-center gap-4">
              <View className="w-16 h-16 rounded-full bg-blue-100 items-center justify-center">
                <IconButton icon="run-fast" iconColor="#2563EB" size={32} />
              </View>
              <View className="flex-1">
                <Text className="text-base text-slate-500">Welcome back</Text>
                <Text numberOfLines={1} className="text-2xl font-bold text-slate-900 mt-1">
                  {user?.displayName || user?.email || 'Runner'}
                </Text>
              </View>
            </View>

            <View className="flex-row gap-2">
              <Card style={{ flex: 1 }} mode="contained">
                <Card.Content style={{ gap: 7, paddingHorizontal: 8 }}>
                  <Text className="text-xs text-slate-500">LOCATION</Text>
                  <Chip compact icon={isTracking ? 'navigation' : permissionState === 'foreground_only' ? 'cellphone-marker' : 'map-marker-off'}>{isTracking ? 'Live' : permissionState === 'foreground_only' ? 'While open' : 'Set up'}</Chip>
                  {!isTracking && <Button mode="text" compact onPress={handleEnableBackgroundTracking}>Enable</Button>}
                </Card.Content>
              </Card>
              <Card style={{ flex: 1 }} mode="contained">
                <Card.Content style={{ gap: 7, paddingHorizontal: 8 }}>
                  <Text className="text-xs text-slate-500">SOCKET</Text>
                  <Chip compact icon={isConnected ? 'wifi' : 'wifi-strength-outline'}>{isConnected ? 'Online' : 'Retrying'}</Chip>
                </Card.Content>
              </Card>
              <Card style={{ flex: 1 }} mode="contained">
                <Card.Content style={{ gap: 7, paddingHorizontal: 8 }}>
                  <Text className="text-xs text-slate-500">QUEUED</Text>
                  <Text className="text-2xl font-bold text-slate-900">{pendingCount}</Text>
                  <Text className="text-xs text-slate-500">{pendingCount === 0 ? 'All synced' : 'Safe to retry'}</Text>
                </Card.Content>
              </Card>
            </View>
          </Card.Content>
        </Card>

        {/* Live dispatcher tasks */}
        <View className="mb-6">
          <View className="mb-2">
            <Text className="text-sm font-medium text-slate-500">ASSIGNED TASKS</Text>
          </View>
          {tasksLoading ? <ActivityIndicator /> : tasksError ? (
            <Card mode="contained" style={{ backgroundColor: '#FEF2F2' }}><Card.Content><Text className="text-red-700">Could not load assigned tasks: {tasksError}</Text></Card.Content></Card>
          ) : prioritizedTasks.length === 0 ? (
            <Card mode="contained"><Card.Content><Text className="text-slate-500">No active tasks assigned.</Text></Card.Content></Card>
          ) : prioritizedTasks.map((task) => {
            const priority = priorityMeta(task.priority);
            const collectedDocuments = task.documents.filter((document) => document.collected).length;
            return <Card key={task.id} mode="elevated" onPress={() => navigation.navigate('TaskDetail', { task })} style={{ marginBottom: 14, borderLeftWidth: 7, borderLeftColor: priority.border, overflow: 'hidden' }}>
              <Card.Content style={{ gap: 14, paddingTop: 18 }}>
                <View className="flex-row items-start gap-2">
                  <View className="flex-1 gap-2">
                    <Text numberOfLines={2} className="text-xl font-bold text-slate-900">{task.clientName}</Text>
                    <View className="flex-row flex-wrap items-center gap-2">
                      <Chip compact icon="alert-circle" textStyle={{ color: priority.border, fontWeight: '700' }} style={{ backgroundColor: priority.chip }}>{priority.label}</Chip>
                      <Chip compact icon="send" textStyle={{ color: '#2563EB', fontWeight: '700' }}>{task.status.replace('_', ' ')}</Chip>
                    </View>
                  </View>
                  <IconButton icon="chevron-right" size={24} onPress={() => navigation.navigate('TaskDetail', { task })} accessibilityLabel={`Open details for ${task.clientName}`} />
                </View>

                <View className="flex-row items-start gap-2">
                  <IconButton icon="map-marker-outline" size={20} iconColor="#64748B" style={{ margin: 0 }} />
                  <Text numberOfLines={3} className="flex-1 text-base leading-6 text-slate-600">{task.clientAddress}</Text>
                </View>

                <View className="flex-row flex-wrap gap-2">
                  <Chip compact icon="phone" onPress={() => Linking.openURL(`tel:${task.clientPhone}`)}>{task.clientPhone}</Chip>
                  <Chip compact icon="file-document-outline">{collectedDocuments}/{task.documents.length} docs</Chip>
                </View>
              </Card.Content>
            </Card>;
          })}
        </View>

      </View>
    </ScrollView>
  );
}
