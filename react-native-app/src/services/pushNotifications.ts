import { Platform } from 'react-native';
import * as Application from 'expo-application';
import * as Notifications from 'expo-notifications';
import { api } from './api';
import { SessionStore } from './sessionStore';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function registerForTaskNotifications(): Promise<void> {
  // The local iOS build uses a free Apple team, which cannot enable APNs.
  if (Platform.OS === 'ios') return;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('task-assignments', {
      name: 'New delivery tasks',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 150, 250],
    });
  }

  const current = await Notifications.getPermissionsAsync();
  const permission = current.granted ? current : await Notifications.requestPermissionsAsync();
  if (!permission.granted) return;

  const deviceToken = await Notifications.getDevicePushTokenAsync();
  const token = deviceToken.data;
  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  await api.registerPushToken(token, platform, Application.nativeApplicationVersion ?? undefined);
  await SessionStore.savePushToken(token);
}

export async function unregisterForTaskNotifications(): Promise<void> {
  if (Platform.OS === 'ios') return;

  const token = await SessionStore.getPushToken();
  if (!token) return;
  try {
    await api.unregisterPushToken(token);
  } finally {
    await SessionStore.clearPushToken();
  }
}
