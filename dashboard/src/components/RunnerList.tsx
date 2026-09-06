import { useMemo, useState } from "react";
import { getRunnerStatus, type RunnerState } from "../lib/types";
import RunnerPresenceBadge from "./RunnerPresenceBadge";

interface Props {
  runners: Record<string, RunnerState>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** The picker keeps a long runner list out of the mobile dashboard flow. */
  compact?: boolean;
}

const statusOrder = { live: 0, stale: 1, idle: 2, offline: 3 } as const;

function runnerLocationSummary(runner: RunnerState) {
  if (!runner.ts) return "No location shared yet";
  return `Last update · ${new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit" }).format(new Date(runner.ts))}`;
}

export default function RunnerList({ runners, selectedId, onSelect, compact = false }: Props) {
  const [query, setQuery] = useState("");
  const list = useMemo(() => Object.values(runners)
    // Archived runners are intentionally omitted, but every active runner
    // remains dispatchable even when their app is offline.
    .filter((runner) => runner.assignmentActive !== false)
    .sort((a, b) => {
      const statusDifference = statusOrder[getRunnerStatus(a)] - statusOrder[getRunnerStatus(b)];
      return statusDifference || a.displayName.localeCompare(b.displayName);
    })
    .filter((runner) => runner.displayName.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())), [runners, query]);

  if (list.length === 0) {
    return (
      <div className="text-on-surface-variant text-sm p-5">
        No active runners are available yet.
      </div>
    );
  }

  return (
    <div className="min-w-0">
      {compact && (
        <div className="border-b border-border px-4 py-3">
          <label className="sr-only" htmlFor="runner-search">Search runners</label>
          <input
            id="runner-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search runners"
            className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-ink outline-none placeholder:text-on-surface-variant focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
        </div>
      )}
      <ul className={`space-y-1 ${compact ? "max-h-[60dvh] overflow-y-auto p-3" : "p-2"}`}>
      {list.map((r) => (
        <li
          key={r.runnerId}
          onClick={() => onSelect(r.runnerId)}
          className={`rounded-2xl p-3 cursor-pointer hover:bg-surface-variant/60 transition ${
            selectedId === r.runnerId ? "bg-[#d9e2ff] shadow-sm" : ""
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate font-semibold text-ink">{r.displayName}</div>
              <div className="mt-1 truncate text-xs text-on-surface-variant">{runnerLocationSummary(r)}</div>
            </div>
            <RunnerPresenceBadge runner={r} />
          </div>
        </li>
      ))}
      </ul>
    </div>
  );
}
