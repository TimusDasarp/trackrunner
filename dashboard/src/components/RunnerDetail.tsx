import type { ReactNode } from "react";
import type { RunnerState } from "../lib/types";
import RunnerPresenceBadge from "./RunnerPresenceBadge";

interface Props {
  runner: RunnerState | null;
  onCreateTask: (runner: RunnerState) => void;
  children?: ReactNode;
}

export default function RunnerDetail({ runner, onCreateTask, children }: Props) {
  if (!runner) {
    return <div className="flex min-h-0 flex-1 flex-col"><div className="px-5 py-4"><div className="font-medium text-ink">Select a runner to view their live data</div><p className="mt-1 text-sm text-on-surface-variant">Choose an active runner from the left to see their current location, recent route, and device details.</p></div>{children && <div className="border-t border-border">{children}</div>}</div>;
  }

  return <div className="flex min-h-0 flex-1 flex-col"><div className="p-4 text-sm"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><div className="text-base font-semibold text-ink">{runner.displayName}</div><RunnerPresenceBadge runner={runner} showBattery={false} /></div><div className="mt-1 truncate text-xs text-on-surface-variant">{runner.email}</div></div><button onClick={() => onCreateTask(runner)} className="shrink-0 rounded-xl bg-accent px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-[#db674b] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">Assign task</button></div></div>{children && <div className="flex min-h-0 flex-1 flex-col border-t border-border">{children}</div>}</div>;
}
