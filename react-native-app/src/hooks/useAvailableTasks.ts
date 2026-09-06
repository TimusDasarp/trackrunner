import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api';
import { socketClient } from '../services/socketClient';
import type { RunnerTask } from '../types';

/** Shared dispatch work that a runner may claim for themselves. */
export function useAvailableTasks() {
  const [tasks, setTasks] = useState<RunnerTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [claimingId, setClaimingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      setTasks(await api.getAvailableTasks());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load available tasks');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const refreshQueue = () => { void refresh(); };
    socketClient.on('available-task:created', refreshQueue);
    socketClient.on('available-task:claimed', refreshQueue);
    return () => {
      socketClient.off('available-task:created', refreshQueue);
      socketClient.off('available-task:claimed', refreshQueue);
    };
  }, [refresh]);

  const claim = useCallback(async (task: RunnerTask) => {
    setClaimingId(task.id);
    try {
      const claimed = await api.claimAvailableTask(task.id);
      setTasks((current) => current.filter((item) => item.id !== claimed.id));
      return claimed;
    } finally {
      setClaimingId(null);
    }
  }, []);

  return { tasks, loading, error, claimingId, refresh, claim };
}
