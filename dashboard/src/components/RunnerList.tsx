import { getRunnerStatus, type RunnerState } from "../lib/types";

interface Props {
  runners: Record<string, RunnerState>;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function batteryClass(b: number | null | undefined) {
  if (b == null) return "text-slate-400";
  if (b < 15) return "text-red-400";
  if (b < 30) return "text-amber-400";
  return "text-emerald-400";
}

export default function RunnerList({ runners, selectedId, onSelect }: Props) {
  const list = Object.values(runners)
    .filter((runner) => getRunnerStatus(runner) === "live")
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  if (list.length === 0) {
    return (
      <div className="text-slate-500 text-sm p-4">
        No runners are actively tracking right now.
      </div>
    );
  }

  return (
    <ul className="divide-y divide-slate-800">
      {list.map((r) => (
        <li
          key={r.runnerId}
          onClick={() => onSelect(r.runnerId)}
          className={`p-3 cursor-pointer hover:bg-slate-800/60 transition ${
            selectedId === r.runnerId ? "bg-slate-800" : ""
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-400" />
              <span className="font-medium truncate">{r.displayName}</span>
            </div>
            <span className={`text-sm font-mono ${batteryClass(r.battery)}`}>
              {r.battery != null ? `${Math.round(r.battery)}%` : "—"}
            </span>
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {r.hasLocation ? `Live · updated ${new Date(r.ts!).toLocaleTimeString()}` : "Waiting for first location"}
          </div>
        </li>
      ))}
    </ul>
  );
}
