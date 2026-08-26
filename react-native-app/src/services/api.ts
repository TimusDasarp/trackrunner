/**
 * Small fetch client for the REST authentication endpoints.
 */

import { API_BASE_URL, requireApiOrigin } from '../constants';
import { SessionStore } from './sessionStore';
import type { AuthResponse, IncompleteReason, LoginCredentials, RunnerTask, TaskAttachment, TaskStatus } from '../types';

type ApiErrorBody = { error?: string; message?: string };

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  requireApiOrigin();
  const token = await SessionStore.getToken();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
    throw new Error(body.error ?? body.message ?? `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

class ApiClient {
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    return request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
  }

  async logout(): Promise<void> {
    try {
      await request('/auth/logout', { method: 'POST' });
    } catch (error) {
      // Logout must still clear the device session when the network is unavailable.
    }
  }

  async registerPushToken(token: string, platform: 'android' | 'ios', appVersion?: string): Promise<void> {
    await request('/devices/push-token', {
      method: 'PUT',
      body: JSON.stringify({ token, platform, appVersion, permissionGranted: true }),
    });
  }

  async unregisterPushToken(token: string): Promise<void> {
    await request('/devices/push-token', {
      method: 'DELETE',
      body: JSON.stringify({ token }),
    });
  }

  async getTasks(): Promise<RunnerTask[]> {
    const response = await request<{ tasks: RunnerTask[] }>('/tasks');
    return response.tasks ?? [];
  }

  async updateTask(id: string, status: TaskStatus, documents?: Array<{ id: string; collected: boolean }>, incomplete?: { reason: IncompleteReason; note?: string }): Promise<RunnerTask> {
    const response = await request<{ task: RunnerTask }>(`/tasks/${id}`, {
      method: 'PATCH', body: JSON.stringify({ status, documents, incompleteReason: incomplete?.reason, incompleteNote: incomplete?.note }),
    });
    return response.task;
  }

  async getTaskAttachments(taskId: string): Promise<TaskAttachment[]> {
    const response = await request<{ attachments: TaskAttachment[] }>(`/tasks/${taskId}/attachments`);
    return response.attachments ?? [];
  }

  async getTaskAttachmentDownloadUrl(taskId: string, attachmentId: string): Promise<string> {
    const response = await request<{ url: string }>(`/tasks/${taskId}/attachments/${attachmentId}/download`);
    return response.url;
  }
}

export const api = new ApiClient();
