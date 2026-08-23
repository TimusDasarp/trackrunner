export type Task = { id: string; runnerId: string; clientName: string; clientAddress: string; clientPhone?: string; notes?: string; destinationLat?: number; destinationLon?: number; status: string; priority?: string; dueAt?: string; documents?: Array<{ name: string }> };

const priorityStyle = (priority?: string) => {
  if (priority === "urgent") return { label: "Urgent", border: "border-l-red-600", badge: "bg-red-100 text-red-800" };
  if (priority === "high") return { label: "High", border: "border-l-amber-500", badge: "bg-amber-100 text-amber-800" };
  return { label: "Normal", border: "border-l-slate-400", badge: "bg-slate-100 text-slate-700" };
};

interface Props {
  tasks: Task[];
  tab: "active" | "completed" | "incomplete";
  onTabChange: (tab: "active" | "completed" | "incomplete") => void;
  selectedRunnerName: string | null;
  runners: Record<string, { displayName: string }>;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
}

export default function TaskBoard({ tasks, tab, onTabChange, selectedRunnerName, runners, onEdit, onDelete }: Props) {
  return <section className="flex min-w-0 flex-col rounded-[24px] border border-border bg-surface p-4 shadow-[var(--shadow-card)] md:p-5 lg:min-h-0 lg:flex-1">
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"><div className="min-w-0"><h2 className="text-sm font-semibold">Tasks</h2><p className="mt-0.5 text-xs text-on-surface-variant">{selectedRunnerName ? `Assignments for ${selectedRunnerName}` : "Select an active runner to view tasks"}</p></div><div className="flex w-full rounded-full bg-surface-variant p-1 text-xs font-semibold sm:w-auto"><button onClick={() => onTabChange("active")} className={`flex-1 rounded-full px-3 py-1.5 sm:flex-none ${tab === "active" ? "bg-white text-accent shadow-sm" : "text-on-surface-variant"}`}>Active</button><button onClick={() => onTabChange("completed")} className={`flex-1 rounded-full px-3 py-1.5 sm:flex-none ${tab === "completed" ? "bg-white text-accent shadow-sm" : "text-on-surface-variant"}`}>Completed</button><button onClick={() => onTabChange("incomplete")} className={`flex-1 rounded-full px-3 py-1.5 sm:flex-none ${tab === "incomplete" ? "bg-white text-accent shadow-sm" : "text-on-surface-variant"}`}>Incomplete</button></div></div>
    <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto">{!selectedRunnerName ? <p className="py-6 text-center text-sm text-on-surface-variant">Choose a runner from the available runners list or map.</p> : tasks.length === 0 ? <p className="py-6 text-center text-sm text-on-surface-variant">No {tab} tasks for this runner.</p> : <div className="mt-4 grid min-w-0 gap-2">{tasks.map((task) => { const priority = priorityStyle(task.priority); const isCompleted = task.status === "completed"; return <div key={task.id} className={`min-w-0 rounded-2xl border border-[#e3e1e9] border-l-4 ${priority.border} p-3`}><div className="w-full min-w-0 text-left"><div className="flex items-start justify-between gap-2"><span className="min-w-0 break-words font-medium">{task.clientName}</span><div className="flex shrink-0 flex-wrap justify-end gap-1">{!isCompleted && <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${priority.badge}`}>{priority.label}</span>}<span className={`rounded-full px-2 py-1 text-[11px] font-semibold capitalize ${tab === "completed" ? "bg-slate-100 text-slate-700" : "bg-[#e9efff] text-accent"}`}>{task.status.replaceAll("_", " ")}</span></div></div><p className="mt-1 break-words text-xs text-on-surface-variant">{task.clientAddress}</p><p className="mt-2 break-words text-xs font-medium text-accent">{runners[task.runnerId]?.displayName ?? "Runner"}</p></div><div className="mt-3 flex justify-end gap-2 border-t border-[#f0eff6] pt-2">{task.status === "sent" && <button onClick={() => onEdit(task)} className="min-h-9 rounded-full px-3 py-1.5 text-xs font-semibold text-accent hover:bg-[#e9efff]">Edit</button>}{(task.status === "completed" || task.status === "unable_to_complete") && <button onClick={() => onDelete(task)} className="min-h-9 rounded-full px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50">Delete</button>}</div></div>; })}</div>}</div>
  </section>;
}
