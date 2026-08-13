type Task = { id: string; runnerId: string; clientName: string; clientAddress: string; status: string };

interface Props {
  tasks: Task[];
  tab: "active" | "completed";
  onTabChange: (tab: "active" | "completed") => void;
  runners: Record<string, { displayName: string }>;
  onSelectRunner: (runnerId: string) => void;
}

export default function TaskBoard({ tasks, tab, onTabChange, runners, onSelectRunner }: Props) {
  return <section className="rounded-[24px] border border-[#e3e1e9] bg-surface p-4 shadow-sm md:p-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-semibold">Tasks</h2><p className="mt-0.5 text-xs text-on-surface-variant">Assignments across all runners</p></div><div className="flex rounded-full bg-[#f0eff6] p-1 text-xs font-semibold"><button onClick={() => onTabChange("active")} className={`rounded-full px-3 py-1.5 ${tab === "active" ? "bg-white text-accent shadow-sm" : "text-on-surface-variant"}`}>Active</button><button onClick={() => onTabChange("completed")} className={`rounded-full px-3 py-1.5 ${tab === "completed" ? "bg-white text-accent shadow-sm" : "text-on-surface-variant"}`}>Completed</button></div></div>
    {tasks.length === 0 ? <p className="py-6 text-center text-sm text-on-surface-variant">No {tab} tasks.</p> : <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{tasks.map((task) => <button key={task.id} onClick={() => onSelectRunner(task.runnerId)} className="rounded-2xl border border-[#e3e1e9] p-3 text-left transition hover:border-[#9db3e2] hover:bg-[#f8f9ff]"><div className="flex items-start justify-between gap-2"><span className="font-medium">{task.clientName}</span><span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold capitalize ${tab === "completed" ? "bg-slate-100 text-slate-700" : "bg-[#e9efff] text-accent"}`}>{task.status.replaceAll("_", " ")}</span></div><p className="mt-1 truncate text-xs text-on-surface-variant">{task.clientAddress}</p><p className="mt-2 text-xs font-medium text-accent">{runners[task.runnerId]?.displayName ?? "Runner"}</p></button>)}</div>}
  </section>;
}
