/**
 * Session storage using expo-secure-store
 * Stores auth token and user data securely
 */

import * as SecureStore from 'expo-secure-store';
import { STORAGE_KEYS } from '../constants';
import type { User } from '../types';

export const SessionStore = {
  async saveToken(token: string): Promise<void> {
    await SecureStore.setItemAsync(STORAGE_KEYS.AUTH_TOKEN, token);
  },

  async getToken(): Promise<string | null> {
    return await SecureStore.getItemAsync(STORAGE_KEYS.AUTH_TOKEN);
  },

  async clearToken(): Promise<void> {
    await SecureStore.deleteItemAsync(STORAGE_KEYS.AUTH_TOKEN);
  },

  async saveUser(user: User): Promise<void> {
    await SecureStore.setItemAsync(STORAGE_KEYS.USER_DATA, JSON.stringify(user));
  },

  async getUser(): Promise<User | null> {
    const data = await SecureStore.getItemAsync(STORAGE_KEYS.USER_DATA);
    return data ? JSON.parse(data) : null;
  },

  async clearUser(): Promise<void> {
    await SecureStore.deleteItemAsync(STORAGE_KEYS.USER_DATA);
  },

  async savePushToken(token: string): Promise<void> {
    await SecureStore.setItemAsync(STORAGE_KEYS.PUSH_TOKEN, token);
  },

  async getPushToken(): Promise<string | null> {
    return await SecureStore.getItemAsync(STORAGE_KEYS.PUSH_TOKEN);
  },

  async clearPushToken(): Promise<void> {
    await SecureStore.deleteItemAsync(STORAGE_KEYS.PUSH_TOKEN);
  },

  async clearAll(): Promise<void> {
    await Promise.all([this.clearToken(), this.clearUser(), this.clearPushToken()]);
  },
};
