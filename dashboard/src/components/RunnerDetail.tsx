import { getRunnerStatus, type RunnerState, type RunnerStatus } from "../lib/types";

interface Props {
  runner: RunnerState | null;
  trail: Array<[number, number]>;
  onRename: (runner: RunnerState) => void;
  onCreateTask: (runner: RunnerState) => void;
}

export default function RunnerDetail({ runner, trail, onRename, onCreateTask }: Props) {
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
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold text-base">{runner.displayName}</div>
          <div className="text-xs text-on-surface-variant break-all">{runner.email}</div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button onClick={() => onRename(runner)} className="rounded-full px-3 py-2 text-xs font-semibold text-accent hover:bg-[#e9efff]">Edit</button>
          <button onClick={() => onCreateTask(runner)} className="rounded-full bg-accent px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[#294b7a]">Assign task</button>
          <StatusBadge status={getRunnerStatus(runner)} />
        </div>
      </div>

      {runner.hasLocation ? <>
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Battery" value={runner.battery != null ? `${Math.round(runner.battery)}%` : "—"} />
          <Stat label="Speed" value={runner.speed != null ? `${runner.speed.toFixed(1)} m/s` : "—"} />
          <Stat label="Accuracy" value={runner.accuracy != null ? `${runner.accuracy.toFixed(0)} m` : "—"} />
          <Stat label="Bearing" value={runner.bearing != null ? `${runner.bearing.toFixed(0)}°` : "—"} />
          <Stat label="Lat" value={runner.lat!.toFixed(5)} />
          <Stat label="Lon" value={runner.lon!.toFixed(5)} />
        </div>
        <div className="text-xs text-on-surface-variant">Last update: {new Date(runner.ts!).toLocaleString()}</div>
      </> : <div className="rounded-lg bg-slate-900 p-3 text-xs text-slate-400">This runner will appear on the map after signing into the app and sending their first location.</div>}

      <div className="text-xs text-on-surface-variant">
        Trail points: <span className="font-mono">{trail.length}</span>
      </div>
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#f2f0f8] rounded-xl p-3">
      <div className="text-[10px] uppercase tracking-wide text-on-surface-variant">{label}</div>
      <div className="font-mono">{value}</div>
    </div>
  );
}
