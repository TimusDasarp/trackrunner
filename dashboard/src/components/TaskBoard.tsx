import TaskCard from "./TaskCard";
import type { DispatcherTask } from "../lib/taskWorkspace";

export type Task = {
  id: string; runnerId: string; clientName: string; clientAddress: string;
  clientPhone?: string; notes?: string; destinationLat?: number; destinationLon?: number;
  status: string; priority?: string; dueAt?: string;
  createdByOperatorId?: string | null; createdByOperatorName?: string | null;
  documents?: Array<{ id?: string; name: string; collected?: boolean }>;
};

interface Props {
  tasks: Task[];
  tab: "active" | "completed" | "incomplete";
  onTabChange: (tab: "active" | "completed" | "incomplete") => void;
  selectedRunnerName: string | null;
  runners: Record<string, { displayName: string }>;
  embedded?: boolean;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
}

/** Dashboard counterpart to the operational queue: same task summary, scoped actions. */
export default function TaskBoard({ tasks, tab, onTabChange, selectedRunnerName, runners, embedded = false, onEdit, onDelete }: Props) {
  return (
    <section className={`flex min-w-0 flex-col p-4 lg:min-h-0 lg:flex-1 ${embedded ? "" : "rounded-[24px] border border-border bg-surface shadow-[var(--shadow-card)] md:p-5"}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="min-w-0"><h2 className="text-sm font-semibold">Tasks</h2><p className="mt-0.5 text-xs text-on-surface-variant">{selectedRunnerName ? `Assignments for ${selectedRunnerName}` : "Select an active runner to view tasks"}</p></div>
        <div className="flex w-full rounded-full bg-surface-variant p-1 text-xs font-semibold sm:w-auto">
          <button onClick={() => onTabChange("active")} className={`flex-1 rounded-full px-3 py-1.5 sm:flex-none ${tab === "active" ? "bg-white text-accent shadow-sm" : "text-on-surface-variant"}`}>Active</button>
          <button onClick={() => onTabChange("completed")} className={`flex-1 rounded-full px-3 py-1.5 sm:flex-none ${tab === "completed" ? "bg-white text-accent shadow-sm" : "text-on-surface-variant"}`}>Completed</button>
          <button onClick={() => onTabChange("incomplete")} className={`flex-1 rounded-full px-3 py-1.5 sm:flex-none ${tab === "incomplete" ? "bg-white text-accent shadow-sm" : "text-on-surface-variant"}`}>Incomplete</button>
        </div>
      </div>

      <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
        {!selectedRunnerName ? <p className="py-6 text-center text-sm text-on-surface-variant">Choose a runner from the available runners list or map.</p> : tasks.length === 0 ? <p className="py-6 text-center text-sm text-on-surface-variant">No {tab} tasks for this runner.</p> : (
          <div className="mt-4 grid min-w-0 gap-2">
            {tasks.map((task) => {
              const canEdit = task.status === "sent";
              const canDelete = task.status === "completed" || task.status === "unable_to_complete";
              return <TaskCard key={task.id} task={task as DispatcherTask} runnerName={runners[task.runnerId]?.displayName ?? "Runner"} actions={(canEdit || canDelete) ? <div className="flex justify-end gap-2">{canEdit && <button onClick={() => onEdit(task)} className="min-h-9 rounded-full px-3 py-1.5 text-xs font-semibold text-accent hover:bg-[#e9efff]">Edit</button>}{canDelete && <button onClick={() => onDelete(task)} className="min-h-9 rounded-full px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50">Delete</button>}</div> : undefined} />;
            })}
          </div>
        )}
      </div>
    </section>
  );
}
