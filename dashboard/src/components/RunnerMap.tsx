import { useMemo } from "react";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import { getRunnerStatus, type RunnerState } from "../lib/types";

function makeIcon(state: RunnerState, selected: boolean) {
  const battery = state.battery ?? null;
  let cls = "dot";
  if (getRunnerStatus(state) !== "live") cls += " offline";
  else cls += " online";
  if (battery != null && battery < 15) cls += " critical";
  else if (battery != null && battery < 30) cls += " low";
  if (selected) cls += " selected";
  return L.divIcon({
    className: "runner-icon",
    html: `<div class="${cls}"></div>`,
    iconSize: selected ? [20, 20] : [16, 16],
    iconAnchor: selected ? [10, 10] : [8, 8],
  });
}

function FlyToRunner({ runner }: { runner: RunnerState | null }) {
  const map = useMap();
  if (runner?.hasLocation) {
    map.flyTo([runner.lat!, runner.lon!], 16, { duration: 0.8 });
  }
  return null;
}

interface Props {
  runners: Record<string, RunnerState>;
  selectedId: string | null;
  trail: Array<[number, number]>;
}

export default function RunnerMap({ runners, selectedId, trail }: Props) {
  const initialCenter = useMemo<[number, number]>(() => {
    const list = Object.values(runners).filter((runner) => runner.hasLocation && getRunnerStatus(runner) === "live");
    if (list.length > 0) return [list[0].lat!, list[0].lon!];
    return [37.7749, -122.4194]; // San Francisco fallback
  }, [runners]);

  const selected = selectedId ? runners[selectedId] ?? null : null;

  return (
    <MapContainer
      center={initialCenter}
      zoom={13}
      className="w-full h-full rounded-2xl"
      style={{ minHeight: 400 }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {Object.values(runners).filter((r) => r.hasLocation && getRunnerStatus(r) === "live").map((r) => (
        <Marker
          key={r.runnerId}
          position={[r.lat!, r.lon!]}
          icon={makeIcon(r, selectedId === r.runnerId)}
        >
          <Popup>
            <div className="text-sm">
              <div className="font-semibold">{r.displayName}</div>
              <div>Battery: {r.battery != null ? `${Math.round(r.battery)}%` : "—"}</div>
              <div>Speed: {r.speed != null ? `${r.speed.toFixed(1)} m/s` : "—"}</div>
              <div>Status: Live tracking</div>
              <div className="text-xs text-slate-500">
                {new Date(r.ts!).toLocaleTimeString()}
              </div>
            </div>
          </Popup>
        </Marker>
      ))}
      {trail.length > 1 && (
        <Polyline positions={trail} pathOptions={{ color: "#405f90", weight: 4 }} />
      )}
      <FlyToRunner runner={selected} />
    </MapContainer>
  );
}
