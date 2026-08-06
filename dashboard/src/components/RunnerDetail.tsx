import type { RunnerState } from "../lib/types";

interface Props {
  runner: RunnerState | null;
  trail: Array<[number, number]>;
}

export default function RunnerDetail({ runner, trail }: Props) {
  if (!runner) {
    return (
      <div className="text-slate-500 text-sm p-4">Select a runner to see details.</div>
    );
  }

  return (
    <div className="p-4 space-y-3 text-sm">
      <div className="flex items-center justify-between">
        <div className="font-semibold text-base">Runner {runner.runnerId}</div>
        <span
          className={`text-xs px-2 py-0.5 rounded-full ${
            runner.online ? "bg-emerald-900 text-emerald-300" : "bg-slate-800 text-slate-400"
          }`}
        >
          {runner.online ? "online" : "offline"}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Stat label="Battery" value={runner.battery != null ? `${Math.round(runner.battery)}%` : "—"} />
        <Stat label="Speed" value={runner.speed != null ? `${runner.speed.toFixed(1)} m/s` : "—"} />
        <Stat label="Accuracy" value={runner.accuracy != null ? `${runner.accuracy.toFixed(0)} m` : "—"} />
        <Stat label="Bearing" value={runner.bearing != null ? `${runner.bearing.toFixed(0)}°` : "—"} />
        <Stat label="Lat" value={runner.lat.toFixed(5)} />
        <Stat label="Lon" value={runner.lon.toFixed(5)} />
      </div>

      <div className="text-xs text-slate-500">
        Last update: {new Date(runner.ts).toLocaleString()}
      </div>

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
