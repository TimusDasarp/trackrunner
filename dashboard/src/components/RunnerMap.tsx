import { useEffect, useMemo } from "react";
import { AdvancedMarker, APIProvider, InfoWindow, Map, Pin, Polyline, useMap } from "@vis.gl/react-google-maps";
import { googleMapsApiKey, googleMapsMapId, hasGoogleMapsConfig } from "../lib/config";
import { getRunnerStatus, type RunnerState } from "../lib/types";

function markerColor(state: RunnerState) {
  const battery = state.battery ?? null;
  if (battery != null && battery < 15) return "#dc2626";
  if (battery != null && battery < 30) return "#d97706";
  return getRunnerStatus(state) === "live" ? "#405f90" : "#64748b";
}

function FlyToRunner({ runner }: { runner: RunnerState | null }) {
  const map = useMap();
  useEffect(() => {
    if (!map || !runner?.hasLocation) return;
    map.panTo({ lat: runner.lat!, lng: runner.lon! });
    map.setZoom(16);
  // Re-centre only when the dispatcher selects another runner. Keeping lat/lon
  // out of this dependency lets dispatchers zoom and pan without live updates
  // snapping the camera back every few seconds.
  }, [map, runner?.runnerId, runner?.hasLocation]);
  return null;
}

interface Props {
  runners: Record<string, RunnerState>;
  selectedId: string | null;
  trail: Array<[number, number]>;
  onSelect: (runnerId: string) => void;
  viewerLocation: { lat: number; lon: number } | null;
  compact?: boolean;
}

export default function RunnerMap({ runners, selectedId, trail, onSelect, viewerLocation, compact = false }: Props) {
  const initialCenter = useMemo<[number, number]>(() => {
    const list = Object.values(runners).filter((runner) => runner.hasLocation && getRunnerStatus(runner) === "live");
    if (list.length > 0) return [list[0].lat!, list[0].lon!];
    if (viewerLocation) return [viewerLocation.lat, viewerLocation.lon];
    return [37.7749, -122.4194]; // San Francisco fallback
  }, [runners, viewerLocation]);

  const selected = selectedId ? runners[selectedId] ?? null : null;
  const liveRunners = Object.values(runners).filter((runner) => runner.hasLocation && getRunnerStatus(runner) === "live");

  if (!hasGoogleMapsConfig) {
    return <MapSetupNotice />;
  }

  return (
    <APIProvider apiKey={googleMapsApiKey} libraries={["places"]}>
      <Map defaultCenter={{ lat: initialCenter[0], lng: initialCenter[1] }} defaultZoom={selected ? 16 : 13} mapId={googleMapsMapId} className="h-full w-full rounded-2xl" style={{ minHeight: compact ? 240 : 400 }} gestureHandling="greedy" zoomControl scrollwheel disableDoubleClickZoom={false}>
        {liveRunners.map((r) => (
          <AdvancedMarker
          key={r.runnerId}
          position={{ lat: r.lat!, lng: r.lon! }}
          onClick={() => onSelect(r.runnerId)}
          title={`Select ${r.displayName}`}
          zIndex={selectedId === r.runnerId ? 2 : 1}
        >
          <Pin background={markerColor(r)} borderColor="#ffffff" glyphColor="#ffffff" scale={selectedId === r.runnerId ? 1.25 : 1} />
          {selectedId === r.runnerId && <InfoWindow position={{ lat: r.lat!, lng: r.lon! }} onCloseClick={() => onSelect("")}>
            <div className="text-sm">
              <div className="font-semibold">{r.displayName}</div>
              <div>Battery: {r.battery != null ? `${Math.round(r.battery)}%` : "—"}</div>
              <div>Speed: {r.speed != null ? `${r.speed.toFixed(1)} m/s` : "—"}</div>
              <div>Status: Live tracking</div>
              <div className="text-xs text-slate-500">
                {new Date(r.ts!).toLocaleTimeString()}
              </div>
            </div>
          </InfoWindow>}
        </AdvancedMarker>
      ))}
      {trail.length > 1 && (
        <Polyline path={trail.map(([lat, lng]) => ({ lat, lng }))} strokeColor="#405f90" strokeWeight={4} />
      )}
      <FlyToRunner runner={selected} />
      </Map>
    </APIProvider>
  );
}

export function MapSetupNotice() {
  return <div className="grid h-full min-h-[400px] place-items-center rounded-2xl bg-[#e8edf6] p-6 text-center text-sm text-on-surface-variant"><div><p className="font-semibold text-ink">Google Maps needs configuration</p><p className="mt-1">Set <code>VITE_GOOGLE_MAPS_API_KEY</code> and <code>VITE_GOOGLE_MAP_ID</code> in <code>dashboard/.env.local</code>.</p></div></div>;
}
