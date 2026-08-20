import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api';
import { socketClient } from '../services/socketClient';
import type { RunnerTask, TaskStatus } from '../types';

export function useTasks() {
  const [tasks, setTasks] = useState<RunnerTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      setTasks(await api.getTasks());
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not load assigned tasks';
      setError(message);
      throw err;
    }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    refresh().catch(() => setLoading(false));
    const upsert = (task: RunnerTask) => setTasks((current) => {
      const next = current.filter((item) => item.id !== task.id);
      return task.status === 'completed' || task.status === 'unable_to_complete' ? next : [task, ...next];
    });
    socketClient.on('task:created', upsert);
    socketClient.on('task:updated', upsert);
    const refreshOnConnect = (connected: boolean) => {
      if (connected) refresh().catch(() => {});
    };
    socketClient.addConnectionListener(refreshOnConnect);
    return () => {
      socketClient.off('task:created', upsert);
      socketClient.off('task:updated', upsert);
      socketClient.removeConnectionListener(refreshOnConnect);
    };
  }, [refresh]);

  const update = useCallback(async (task: RunnerTask, status: TaskStatus, documents = task.documents) => {
    const updated = await api.updateTask(task.id, status, documents.map((doc) => ({ id: doc.id, collected: doc.collected })));
    setTasks((current) => updated.status === 'completed' || updated.status === 'unable_to_complete'
      ? current.filter((item) => item.id !== updated.id)
      : [updated, ...current.filter((item) => item.id !== updated.id)]);
  }, []);
  return { tasks, loading, error, refresh, update };
}
