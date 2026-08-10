/**
 * Small fetch client for the REST authentication endpoints.
 */

import { API_BASE_URL, requireApiOrigin } from '../constants';
import { SessionStore } from './sessionStore';
import type { AuthResponse, LoginCredentials, RunnerTask, TaskStatus } from '../types';

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

  async getTasks(): Promise<RunnerTask[]> {
    const response = await request<{ tasks: RunnerTask[] }>('/api/tasks');
    return response.tasks ?? [];
  }

  async updateTask(id: string, status: TaskStatus, documents?: Array<{ id: string; collected: boolean }>): Promise<RunnerTask> {
    const response = await request<{ task: RunnerTask }>(`/api/tasks/${id}`, {
      method: 'PATCH', body: JSON.stringify({ status, documents }),
    });
    return response.task;
  }
}

export const api = new ApiClient();
