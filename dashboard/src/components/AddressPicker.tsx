import { useEffect, useState } from "react";
import { MapContainer, Marker, TileLayer, useMapEvents } from "react-leaflet";

export type AddressPin = { address: string; lat: number; lon: number };
type Place = AddressPin & { display_name: string };

function Pin({ value, onChange }: { value: AddressPin | null; onChange: (pin: AddressPin) => void }) {
  useMapEvents({ click(event) { onChange({ address: value?.address ?? "Pinned location", lat: event.latlng.lat, lon: event.latlng.lng }); } });
  return value ? <Marker position={[value.lat, value.lon]} draggable eventHandlers={{ dragend: (event) => { const point = event.target.getLatLng(); onChange({ ...value, lat: point.lat, lon: point.lng }); } }} /> : null;
}

export default function AddressPicker({ value, onChange }: { value: AddressPin | null; onChange: (pin: AddressPin) => void }) {
  const [query, setQuery] = useState(value?.address ?? "");
  const [results, setResults] = useState<Place[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setQuery(value?.address ?? ""), [value?.address]);
  useEffect(() => {
    if (query.trim().length < 3 || query === value?.address) return setResults([]);
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        setError(null);
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=${encodeURIComponent(query)}`, { signal: controller.signal });
        if (!response.ok) throw new Error("Address search is unavailable");
        const places = await response.json() as Array<{ display_name: string; lat: string; lon: string }>;
        setResults(places.map((place) => ({ address: place.display_name, display_name: place.display_name, lat: Number(place.lat), lon: Number(place.lon) })));
      } catch (err) { if ((err as Error).name !== "AbortError") setError("Could not search addresses. You can still place a pin manually."); }
    }, 500);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query, value?.address]);

  const center: [number, number] = value ? [value.lat, value.lon] : [12.9716, 77.5946];
  return <div className="mb-3 space-y-2">
    <label className="block text-sm">Delivery address</label>
    <input className="w-full rounded-xl border border-[#777680] bg-transparent px-3 py-2" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search an address or landmark" />
    {results.length > 0 && <div className="max-h-40 overflow-y-auto rounded-xl border border-[#e3e1e9] bg-white">{results.map((place) => <button type="button" key={`${place.lat}-${place.lon}`} className="block w-full border-b border-[#f0eff6] px-3 py-2 text-left text-xs hover:bg-[#f6f5fa]" onClick={() => { onChange(place); setResults([]); }}>{place.display_name}</button>)}</div>}
    {error && <p className="text-xs text-amber-700">{error}</p>}
    <MapContainer center={center} zoom={value ? 16 : 12} className="h-52 w-full rounded-xl" key={`${center[0]}-${center[1]}`}>
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <Pin value={value} onChange={onChange} />
    </MapContainer>
    <p className="text-xs text-on-surface-variant">Search then choose an address, or click/drag the pin to set the delivery location.</p>
  </div>;
}
