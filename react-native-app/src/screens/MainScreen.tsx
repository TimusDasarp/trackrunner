import React, { useState } from 'react';
import {
  View,
  Text,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { ActivityIndicator, Button, Card, Chip, IconButton } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../hooks/useAuth';
import { useTracking } from '../hooks/useTracking';
import { useTasks } from '../hooks/useTasks';
import { useAvailableTasks } from '../hooks/useAvailableTasks';
import { runnerTheme } from '../theme/paperTheme';
import type { RunnerTask } from '../types';

export default function MainScreen() {
  const colors = runnerTheme.colors;
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
  const { tasks: availableTasks, loading: availableLoading, error: availableError, claimingId, refresh: refreshAvailable, claim } = useAvailableTasks();
  const [taskTab, setTaskTab] = useState<'assigned' | 'available'>('assigned');
  const priorityMeta = (priority?: RunnerTask['priority']) => priority === 'urgent'
    ? { label: 'URGENT', border: colors.danger, chip: colors.dangerSoft }
    : priority === 'high'
      ? { label: 'HIGH', border: colors.warning, chip: colors.warningSoft }
      : { label: 'NORMAL', border: colors.brand, chip: colors.brandSoft };
  const prioritizedTasks = [...tasks].sort((a, b) => {
    const rank = (priority?: RunnerTask['priority']) => priority === 'urgent' ? 0 : priority === 'high' ? 1 : 2;
    return rank(a.priority) - rank(b.priority);
  });
  const locationIndicator = isTracking
    ? { color: colors.success, label: 'Location always allowed' }
    : permissionState === 'foreground_only'
      ? { color: colors.warning, label: 'Location allowed while the app is open' }
      : { color: colors.muted, label: 'Location offline' };

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

  function confirmClaim(task: RunnerTask) {
    Alert.alert(
      'Take this task?',
      'This will assign the task to you and add it to My tasks.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Take task',
          onPress: () => {
            void claim(task)
              .then(() => {
                setTaskTab('assigned');
                void refreshTasks();
              })
              .catch((error) => {
                Alert.alert('Task unavailable', error instanceof Error ? error.message : 'This task was just taken by another runner.');
                void refreshAvailable();
              });
          },
        },
      ],
    );
  }

  return (
    <ScrollView
      className="flex-1"
      style={{ backgroundColor: colors.background }}
      refreshControl={
        <RefreshControl
          refreshing={false}
          onRefresh={() => { refreshPendingCount(); void refreshTasks(); void refreshAvailable(); }}
        />
      }
    >
      <View className="px-6 pt-12 pb-6">
        <View className="flex-row justify-between items-center mb-7">
          <Text className="text-4xl font-bold" style={{ color: colors.text }}>Tasks</Text>
          <IconButton icon="logout" mode="contained" size={24} onPress={handleLogout} accessibilityLabel="Logout" />
        </View>

        <Card mode="contained" style={{ marginBottom: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.outline }}>
          <Card.Content style={{ gap: 12, paddingVertical: 14 }}>
            <View className="flex-row items-center gap-3">
              <View className="w-12 h-12 rounded-full items-center justify-center" style={{ backgroundColor: colors.brandSoft }}>
                <IconButton icon="run-fast" iconColor={colors.brand} size={24} />
              </View>
              <View className="flex-1">
                <Text className="text-sm text-slate-500">Welcome back</Text>
                <View className="flex-row items-center gap-2">
                  <Pressable onPress={!isTracking ? handleEnableBackgroundTracking : undefined} accessibilityRole={!isTracking ? 'button' : 'image'} accessibilityLabel={isTracking ? locationIndicator.label : `${locationIndicator.label}. Tap to enable background location.`} hitSlop={10}>
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: locationIndicator.color }} />
                  </Pressable>
                  <Text numberOfLines={1} className="flex-1 text-xl font-bold" style={{ color: colors.text }}>
                    {user?.displayName || user?.email || 'Runner'}
                  </Text>
                </View>
              </View>
            </View>

            <View className="flex-row gap-2">
              <Card style={{ flex: 1 }} mode="contained">
                <Card.Content style={{ gap: 4, paddingHorizontal: 10, paddingVertical: 8 }}>
                  <Text className="text-xs text-slate-500">SOCKET</Text>
                  <Chip compact icon={isConnected ? 'wifi' : 'wifi-strength-outline'}>{isConnected ? 'Online' : 'Retrying'}</Chip>
                </Card.Content>
              </Card>
              <Card style={{ flex: 1 }} mode="contained">
                <Card.Content style={{ gap: 2, paddingHorizontal: 10, paddingVertical: 8 }}>
                  <Text className="text-xs text-slate-500">QUEUED</Text>
                  <Text className="text-2xl font-bold text-slate-900">{pendingCount}</Text>
                  <Text className="text-xs text-slate-500">{pendingCount === 0 ? 'All synced' : 'Safe to retry'}</Text>
                </Card.Content>
              </Card>
            </View>
          </Card.Content>
        </Card>

        <View className="mb-5 flex-row rounded-2xl p-1" style={{ backgroundColor: colors.surfaceMuted }}>
          <Pressable onPress={() => setTaskTab('assigned')} className="min-h-11 flex-1 items-center justify-center rounded-xl" style={taskTab === 'assigned' ? { backgroundColor: colors.surface } : undefined} accessibilityRole="tab" accessibilityState={{ selected: taskTab === 'assigned' }}>
            <Text className="font-semibold" style={{ color: taskTab === 'assigned' ? colors.brand : colors.muted }}>My tasks</Text>
          </Pressable>
          <Pressable onPress={() => setTaskTab('available')} className="min-h-11 flex-1 items-center justify-center rounded-xl" style={taskTab === 'available' ? { backgroundColor: colors.surface } : undefined} accessibilityRole="tab" accessibilityState={{ selected: taskTab === 'available' }}>
            <Text className="font-semibold" style={{ color: taskTab === 'available' ? colors.brand : colors.muted }}>Available tasks{availableTasks.length ? ` · ${availableTasks.length}` : ''}</Text>
          </Pressable>
        </View>

        {/* Live dispatcher tasks */}
        {taskTab === 'assigned' &&
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
                      <Chip compact icon="send" textStyle={{ color: colors.brand, fontWeight: '700' }} style={{ backgroundColor: colors.brandSoft }}>{task.status.replace('_', ' ')}</Chip>
                    </View>
                  </View>
                  <IconButton icon="chevron-right" size={24} onPress={() => navigation.navigate('TaskDetail', { task })} accessibilityLabel={`Open details for ${task.clientName}`} />
                </View>

                <View className="flex-row items-start gap-2">
                  <IconButton icon="map-marker-outline" size={20} iconColor="#64748B" style={{ margin: 0 }} />
                  <Text numberOfLines={3} className="flex-1 text-base leading-6 text-slate-600">{task.clientAddress}</Text>
                </View>

                <View className="flex-row flex-wrap gap-2">
                  {task.createdByOperatorName ? (
                    <Chip
                      compact
                      icon="account-outline"
                      style={{ backgroundColor: colors.brandSoft }}
                      textStyle={{ color: colors.brand, fontWeight: '700' }}
                    >
                      Assigned by {task.createdByOperatorName}
                    </Chip>
                  ) : null}
                  <Chip compact icon="phone" onPress={() => Linking.openURL(`tel:${task.clientPhone}`)}>{task.clientPhone}</Chip>
                  <Chip compact icon="file-document-outline">{collectedDocuments}/{task.documents.length} docs</Chip>
                </View>
              </Card.Content>
            </Card>;
          })}
        </View>
        }

        {taskTab === 'available' && <View className="mb-6">
          <View className="mb-2">
            <Text className="text-sm font-medium text-slate-500">AVAILABLE TASKS</Text>
            <Text className="mt-1 text-sm text-slate-600">Choose work that you can complete today.</Text>
          </View>
          {availableLoading ? <ActivityIndicator /> : availableError ? (
            <Card mode="contained" style={{ backgroundColor: '#FEF2F2' }}><Card.Content><Text className="text-red-700">Could not load available tasks: {availableError}</Text></Card.Content></Card>
          ) : availableTasks.length === 0 ? (
            <Card mode="contained"><Card.Content><Text className="text-slate-500">No unassigned tasks are available right now.</Text></Card.Content></Card>
          ) : availableTasks.map((task) => {
            const priority = priorityMeta(task.priority);
            return <Card key={task.id} mode="elevated" style={{ marginBottom: 14, borderLeftWidth: 7, borderLeftColor: priority.border, overflow: 'hidden' }}>
              <Card.Content style={{ gap: 12, paddingTop: 18 }}>
                <View className="flex-row items-start justify-between gap-2"><Text numberOfLines={2} className="flex-1 text-xl font-bold text-slate-900">{task.clientName}</Text><Chip compact textStyle={{ color: priority.border, fontWeight: '700' }} style={{ backgroundColor: priority.chip }}>{priority.label}</Chip></View>
                <View className="flex-row items-start gap-2"><IconButton icon="map-marker-outline" size={20} iconColor="#64748B" style={{ margin: 0 }} /><Text numberOfLines={2} className="flex-1 text-base leading-6 text-slate-600">{task.clientAddress}</Text></View>
                <View className="flex-row flex-wrap gap-2"><Chip compact icon="clock-outline">{task.dueAt ? new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(task.dueAt)) : 'No schedule'}</Chip><Chip compact icon="file-document-outline">0/{task.documents.length} docs</Chip>{task.createdByOperatorName ? <Chip compact icon="account-outline" style={{ backgroundColor: colors.brandSoft }} textStyle={{ color: colors.brand, fontWeight: '700' }}>Assigned by {task.createdByOperatorName}</Chip> : null}</View>
                <Button mode="contained" icon="hand-back-right-outline" contentStyle={{ height: 46 }} loading={claimingId === task.id} disabled={claimingId !== null} onPress={() => confirmClaim(task)}>Take task</Button>
              </Card.Content>
            </Card>;
          })}
        </View>}

      </View>
    </ScrollView>
  );
}
