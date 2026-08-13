import { getRunnerStatus, type RunnerState, type RunnerStatus } from "../lib/types";

interface Props {
  runner: RunnerState | null;
  trail: Array<[number, number]>;
  onRename: (runner: RunnerState) => void;
  onCreateTask: (runner: RunnerState) => void;
  tasks: Array<{ id: string; clientName: string; clientAddress: string; status: string }>;
}

export default function RunnerDetail({ runner, trail, onRename, onCreateTask, tasks }: Props) {
  if (!runner) {
    return (
      <div className="px-5 py-4">
        <div className="font-medium text-ink">Select a runner to view their live data</div>
        <p className="mt-1 text-sm text-on-surface-variant">Choose an active runner from the left to see their current location, recent route, and device details.</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3 text-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="font-semibold text-base">{runner.displayName}</div>
          <StatusBadge status={getRunnerStatus(runner)} />
          <div className="text-xs text-on-surface-variant break-all">{runner.email}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-[#f2f0f8] px-3 py-2 text-xs font-semibold text-on-surface-variant">Battery {runner.battery != null ? `${Math.round(runner.battery)}%` : "—"}</span>
          <button onClick={() => onRename(runner)} className="rounded-full px-3 py-2 text-xs font-semibold text-accent hover:bg-[#e9efff]">Edit</button>
          <button onClick={() => onCreateTask(runner)} className="rounded-full bg-accent px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[#294b7a]">Assign task</button>
        </div>
      </div>

      <div className="rounded-xl bg-[#f6f5fa] p-3"><div className="mb-2 text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Active tasks</div>{tasks.length === 0 ? <p className="text-xs text-on-surface-variant">No unfinished tasks assigned.</p> : <div className="space-y-2">{tasks.map((task) => <div key={task.id} className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2"><div><div className="font-medium">{task.clientName}</div><div className="text-xs text-on-surface-variant">{task.clientAddress}</div></div><span className="rounded-full bg-[#e9efff] px-2 py-1 text-xs font-medium capitalize text-accent">{task.status.replace("_", " ")}</span></div>)}</div>}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: RunnerStatus }) {
  const styles: Record<RunnerStatus, string> = {
    live: "bg-emerald-100 text-emerald-800",
    stale: "bg-amber-100 text-amber-800",
    idle: "bg-sky-100 text-sky-800",
    offline: "bg-slate-200 text-slate-700",
  };
  return <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${styles[status]}`}>{status}</span>;
}

