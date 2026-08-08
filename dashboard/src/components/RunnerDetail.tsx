import type { RunnerState } from "../lib/types";

interface Props {
  runner: RunnerState | null;
  trail: Array<[number, number]>;
  onRename: (runner: RunnerState) => void;
}

export default function RunnerDetail({ runner, trail, onRename }: Props) {
  if (!runner) {
    return (
      <div className="text-slate-500 text-sm p-4">Select a runner to see details.</div>
    );
  }

  return (
    <div className="p-4 space-y-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold text-base">{runner.displayName}</div>
          <div className="text-xs text-slate-500 break-all">{runner.email}</div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button onClick={() => onRename(runner)} className="text-xs text-accent hover:underline">Edit</button>
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${
              runner.online ? "bg-emerald-900 text-emerald-300" : "bg-slate-800 text-slate-400"
            }`}
          >
            {runner.online ? "online" : "offline"}
          </span>
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
        <div className="text-xs text-slate-500">Last update: {new Date(runner.ts!).toLocaleString()}</div>
      </> : <div className="rounded-lg bg-slate-900 p-3 text-xs text-slate-400">This runner will appear on the map after signing into the app and sending their first location.</div>}

      <div className="text-xs text-slate-400">
        Trail points: <span className="font-mono">{trail.length}</span>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-900 rounded-lg p-2">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="font-mono">{value}</div>
    </div>
  );
}
