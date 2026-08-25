/** Shared task-workspace rules. Keeping these pure makes dispatcher decisions
 * predictable in the UI and straightforward to verify with automated tests. */
export type TaskStatus = "sent" | "acknowledged" | "in_progress" | "completed" | "unable_to_complete";
export type TaskPriority = "normal" | "high" | "urgent";

export type TaskDocument = { id?: string; name: string; collected?: boolean };
export type DispatcherTask = {
  id: string;
  runnerId: string;
  clientName: string;
  clientAddress: string;
  clientPhone?: string;
  notes?: string;
  priority?: TaskPriority;
  status: TaskStatus;
  dueAt?: string | null;
  createdAt?: string;
  acknowledgedAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  destinationLat?: number | null;
  destinationLon?: number | null;
  documents?: TaskDocument[];
};

export type DispatchRunner = {
  runnerId: string;
  displayName: string;
  online: boolean;
  trackingActive: boolean;
  status?: "live" | "stale" | "idle" | "offline";
  hasLocation?: boolean;
  lat?: number;
  lon?: number;
};

export const statusLabel: Record<TaskStatus, string> = {
  sent: "Assigned",
  acknowledged: "Acknowledged",
  in_progress: "In progress",
  completed: "Completed",
  unable_to_complete: "Unable to complete",
};

export function isFinished(task: DispatcherTask) {
  return task.status === "completed" || task.status === "unable_to_complete";
}

export function beginsToday(value?: string | null, now = new Date()) {
  if (!value) return false;
  const date = new Date(value);
  return date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();
}

export function taskHealth(task: DispatcherTask, runner?: DispatchRunner, now = Date.now()) {
  if (isFinished(task)) return { label: "Closed", color: "default" as const };
  if (!task.runnerId) return { label: "Unassigned", color: "error" as const };
  const dueAt = task.dueAt ? new Date(task.dueAt).getTime() : null;
  if (dueAt != null && dueAt < now) return { label: "Overdue", color: "error" as const };
  if (runner?.status === "offline") return { label: "Runner offline", color: "warning" as const };
  if (runner?.status === "stale") return { label: "Runner location stale", color: "warning" as const };
  if (dueAt != null && dueAt - now < 2 * 60 * 60 * 1000) return { label: "Due soon", color: "warning" as const };
  if (task.priority === "urgent" && task.status === "sent") return { label: "Needs acknowledgement", color: "warning" as const };
  return { label: "On track", color: "success" as const };
}
