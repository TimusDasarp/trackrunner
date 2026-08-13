export type Task = { id: string; runnerId: string; clientName: string; clientAddress: string; clientPhone?: string; notes?: string; destinationLat?: number; destinationLon?: number; status: string; documents?: Array<{ name: string }> };

interface Props {
  tasks: Task[];
  tab: "active" | "completed";
  onTabChange: (tab: "active" | "completed") => void;
  runners: Record<string, { displayName: string }>;
  onSelectRunner: (runnerId: string) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
}

export default function TaskBoard({ tasks, tab, onTabChange, runners, onSelectRunner, onEdit, onDelete }: Props) {
  return <section className="min-w-0 rounded-[24px] border border-[#e3e1e9] bg-surface p-4 shadow-sm md:p-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"><div className="min-w-0"><h2 className="text-sm font-semibold">Tasks</h2><p className="mt-0.5 text-xs text-on-surface-variant">Assignments across all runners</p></div><div className="flex w-full rounded-full bg-[#f0eff6] p-1 text-xs font-semibold sm:w-auto"><button onClick={() => onTabChange("active")} className={`flex-1 rounded-full px-3 py-1.5 sm:flex-none ${tab === "active" ? "bg-white text-accent shadow-sm" : "text-on-surface-variant"}`}>Active</button><button onClick={() => onTabChange("completed")} className={`flex-1 rounded-full px-3 py-1.5 sm:flex-none ${tab === "completed" ? "bg-white text-accent shadow-sm" : "text-on-surface-variant"}`}>Completed</button></div></div>
    {tasks.length === 0 ? <p className="py-6 text-center text-sm text-on-surface-variant">No {tab} tasks.</p> : <div className="mt-4 grid min-w-0 gap-2">{tasks.map((task) => <div key={task.id} className="min-w-0 rounded-2xl border border-[#e3e1e9] p-3 transition hover:border-[#9db3e2] hover:bg-[#f8f9ff]"><button onClick={() => onSelectRunner(task.runnerId)} className="w-full min-w-0 text-left"><div className="flex items-start justify-between gap-2"><span className="min-w-0 break-words font-medium">{task.clientName}</span><span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold capitalize ${tab === "completed" ? "bg-slate-100 text-slate-700" : "bg-[#e9efff] text-accent"}`}>{task.status.replaceAll("_", " ")}</span></div><p className="mt-1 break-words text-xs text-on-surface-variant">{task.clientAddress}</p><p className="mt-2 break-words text-xs font-medium text-accent">{runners[task.runnerId]?.displayName ?? "Runner"}</p></button><div className="mt-3 flex justify-end gap-2 border-t border-[#f0eff6] pt-2">{task.status === "sent" && <button onClick={() => onEdit(task)} className="min-h-9 rounded-full px-3 py-1.5 text-xs font-semibold text-accent hover:bg-[#e9efff]">Edit</button>}{(task.status === "completed" || task.status === "unable_to_complete") && <button onClick={() => onDelete(task)} className="min-h-9 rounded-full px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50">Delete</button>}</div></div>)}</div>}
  </section>;
}
