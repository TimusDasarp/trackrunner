import { getRunnerStatus, type RunnerState } from "../lib/types";

interface Props {
  runners: Record<string, RunnerState>;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function batteryClass(b: number | null | undefined) {
  if (b == null) return "text-slate-500";
  if (b < 15) return "text-red-700";
  if (b < 30) return "text-amber-700";
  return "text-emerald-700";
}

const statusPresentation = {
  live: { dot: "bg-emerald-600", label: "Live location" },
  stale: { dot: "bg-amber-600", label: "Location stale" },
  idle: { dot: "bg-sky-500", label: "Location while app is open" },
  offline: { dot: "bg-slate-500", label: "Offline" },
} as const;

const statusOrder = { live: 0, stale: 1, idle: 2, offline: 3 } as const;

function runnerLocationSummary(runner: RunnerState) {
  const status = getRunnerStatus(runner);
  const time = runner.ts ? ` · updated ${new Date(runner.ts).toLocaleTimeString()}` : "";
  if (status === "live") return `Live location${time}`;
  if (status === "stale") return `Last location is stale${time}`;
  if (status === "idle") return "Location updates while the app is open";
  return runner.hasLocation ? `Offline · last location${time}` : "Offline · no location shared yet";
}

export default function RunnerList({ runners, selectedId, onSelect }: Props) {
  const list = Object.values(runners)
    // Archived runners are intentionally omitted, but every active runner
    // remains dispatchable even when their app is offline.
    .filter((runner) => runner.assignmentActive !== false)
    .sort((a, b) => {
      const statusDifference = statusOrder[getRunnerStatus(a)] - statusOrder[getRunnerStatus(b)];
      return statusDifference || a.displayName.localeCompare(b.displayName);
    });

  if (list.length === 0) {
    return (
      <div className="text-on-surface-variant text-sm p-5">
        No active runners are available yet.
      </div>
    );
  }

  return (
    <ul className="space-y-1 p-2">
      {list.map((r) => (
        <li
          key={r.runnerId}
          onClick={() => onSelect(r.runnerId)}
          className={`rounded-2xl p-3 cursor-pointer hover:bg-surface-variant/60 transition ${
            selectedId === r.runnerId ? "bg-[#d9e2ff] shadow-sm" : ""
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${statusPresentation[getRunnerStatus(r)].dot}`}
                title={statusPresentation[getRunnerStatus(r)].label}
                aria-label={statusPresentation[getRunnerStatus(r)].label}
                role="img"
              />
              <span className="font-medium truncate">{r.displayName}</span>
            </div>
            <span className={`text-sm font-mono ${batteryClass(r.battery)}`}>
              {r.battery != null ? `${Math.round(r.battery)}%` : "—"}
            </span>
          </div>
          <div className="text-xs text-on-surface-variant mt-1">
            {runnerLocationSummary(r)}
          </div>
        </li>
      ))}
    </ul>
  );
}
