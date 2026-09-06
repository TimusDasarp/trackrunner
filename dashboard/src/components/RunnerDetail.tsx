import type { ReactNode } from "react";
import { getRunnerStatus, type RunnerState, type RunnerStatus } from "../lib/types";

interface Props {
  runner: RunnerState | null;
  onCreateTask: (runner: RunnerState) => void;
  children?: ReactNode;
}

export default function RunnerDetail({ runner, onCreateTask, children }: Props) {
  if (!runner) {
    return <div className="flex min-h-0 flex-1 flex-col"><div className="px-5 py-4"><div className="font-medium text-ink">Select a runner to view their live data</div><p className="mt-1 text-sm text-on-surface-variant">Choose an active runner from the left to see their current location, recent route, and device details.</p></div>{children && <div className="border-t border-border">{children}</div>}</div>;
  }

  return <div className="flex min-h-0 flex-1 flex-col"><div className="p-4 text-sm"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="flex flex-wrap items-center gap-2"><div className="text-base font-semibold">{runner.displayName}</div><StatusBadge status={getRunnerStatus(runner)} /><div className="break-all text-xs text-on-surface-variant">{runner.email}</div></div><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-[#f2f0f8] px-3 py-2 text-xs font-semibold text-on-surface-variant">Battery {runner.battery != null ? `${Math.round(runner.battery)}%` : "—"}</span><button onClick={() => onCreateTask(runner)} className="rounded-full bg-accent px-4 py-2 text-xs text-white shadow-sm hover:bg-[#294b7a]">Assign task</button></div></div></div>{children && <div className="flex min-h-0 flex-1 flex-col border-t border-border">{children}</div>}</div>;
}

function StatusBadge({ status }: { status: RunnerStatus }) {
  const styles: Record<RunnerStatus, string> = {
    live: "bg-emerald-100 text-emerald-800",
    stale: "bg-amber-100 text-amber-800",
    idle: "bg-sky-100 text-sky-800",
    offline: "bg-slate-200 text-slate-700",
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs capitalize ${styles[status]}`}>{status}</span>;
}
