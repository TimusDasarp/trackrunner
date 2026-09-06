import Battery20RoundedIcon from "@mui/icons-material/Battery20Rounded";
import BatteryFullRoundedIcon from "@mui/icons-material/BatteryFullRounded";
import BatteryUnknownRoundedIcon from "@mui/icons-material/BatteryUnknownRounded";
import type { RunnerState, RunnerStatus } from "../lib/types";
import { getRunnerStatus } from "../lib/types";

type Props = {
  runner: RunnerState;
  /** The roster carries device telemetry; the detail header can stay minimal. */
  showBattery?: boolean;
};

const appearance: Record<RunnerStatus, { label: string; className: string }> = {
  live: { label: "Live", className: "border-emerald-200 bg-emerald-50 text-emerald-900" },
  stale: { label: "Stale", className: "border-amber-200 bg-amber-50 text-amber-950" },
  idle: { label: "App open", className: "border-sky-200 bg-sky-50 text-sky-950" },
  offline: { label: "Offline", className: "border-slate-200 bg-slate-100 text-slate-800" },
};

function updateLabel(timestamp?: number) {
  if (!timestamp) return "No location yet";
  return `Updated ${new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp))}`;
}

function BatteryIndicator({ battery }: { battery: number | null | undefined }) {
  if (battery == null) return <BatteryUnknownRoundedIcon sx={{ fontSize: 16 }} aria-hidden="true" />;
  const Icon = battery < 30 ? Battery20RoundedIcon : BatteryFullRoundedIcon;
  return <Icon sx={{ fontSize: 16 }} aria-hidden="true" />;
}

/** One accessible status treatment used in the runner roster and detail header. */
export default function RunnerPresenceBadge({ runner, showBattery = true }: Props) {
  const status = getRunnerStatus(runner);
  const tone = appearance[status];
  const battery = runner.battery == null ? "Battery unavailable" : `${Math.round(runner.battery)}% battery`;

  return (
    <span
      className={`inline-flex min-h-7 max-w-full items-center gap-1.5 rounded-full border px-2 py-1 text-xs font-semibold ${tone.className}`}
      aria-label={`${tone.label}. ${updateLabel(runner.ts)}. ${battery}.`}
      title={`${tone.label} · ${updateLabel(runner.ts)} · ${battery}`}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden="true" />
      <span>{tone.label}</span>
      {showBattery && <span className="ml-0.5 inline-flex items-center gap-0.5 border-l border-current/20 pl-1.5">
        <BatteryIndicator battery={runner.battery} />
        <span>{runner.battery == null ? "—" : `${Math.round(runner.battery)}%`}</span>
      </span>}
    </span>
  );
}
