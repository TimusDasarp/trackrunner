import { useEffect, useRef } from "react";
import { AdvancedMarker, APIProvider, Map, Pin, useMap, useMapsLibrary } from "@vis.gl/react-google-maps";
import { googleMapsApiKey, googleMapsMapId, hasGoogleMapsConfig } from "../lib/config";
import { MapSetupNotice } from "./RunnerMap";

export type AddressPin = { address: string; lat: number; lon: number };

function AddressSearch({ value, onChange }: { value: AddressPin | null; onChange: (pin: AddressPin) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  const places = useMapsLibrary("places");

  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  useEffect(() => {
    const PlaceAutocompleteElement = (places as any)?.PlaceAutocompleteElement;
    if (!PlaceAutocompleteElement || !containerRef.current) return;
    const autocomplete = new PlaceAutocompleteElement({ includedRegionCodes: ["in"] }) as any;
    autocomplete.className = "block w-full";
    autocomplete.style.border = "0";
    autocomplete.style.outline = "0";
    autocomplete.style.background = "transparent";
    autocomplete.style.color = "#1b1b1f";
    autocomplete.style.colorScheme = "light";
    autocomplete.setAttribute("placeholder", "Search an India address or landmark");
    autocomplete.setAttribute("aria-label", "Search delivery address");
    const onSelect = async (event: any) => {
      const place = event.placePrediction?.toPlace();
      if (!place) return;
      await place.fetchFields({ fields: ["displayName", "formattedAddress", "location"] });
      const location = place.location;
      if (!location) return;
      onChangeRef.current({ address: place.formattedAddress ?? place.displayName ?? "Pinned location", lat: location.lat(), lon: location.lng() });
    };
    autocomplete.addEventListener("gmp-select", onSelect);
    containerRef.current.replaceChildren(autocomplete);
    return () => {
      autocomplete.removeEventListener("gmp-select", onSelect);
      autocomplete.remove();
    };
  }, [places]);

  return <div className="delivery-address-search min-h-[38px] rounded-xl border border-[#777680] bg-white px-3 py-[7px] text-ink shadow-sm transition focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/15" aria-label={value?.address ? `Selected delivery address: ${value.address}` : "Delivery address search"}><div ref={containerRef} /></div>;
}

function FocusPin({ value }: { value: AddressPin | null }) {
  const map = useMap();
  useEffect(() => { if (map && value) { map.panTo({ lat: value.lat, lng: value.lon }); map.setZoom(16); } }, [map, value?.lat, value?.lon]);
  return null;
}

async function addressAt(lat: number, lon: number, fallback?: string) {
  try {
    const geocoder = new google.maps.Geocoder();
    const { results } = await geocoder.geocode({ location: { lat, lng: lon }, region: "IN" });
    return results[0]?.formatted_address ?? fallback ?? "Pinned location";
  } catch {
    return fallback ?? "Pinned location";
  }
}

function AddressMap({ value, onChange }: { value: AddressPin | null; onChange: (pin: AddressPin) => void }) {
  const center = value ? { lat: value.lat, lng: value.lon } : { lat: 12.9716, lng: 77.5946 };
  return <Map defaultCenter={center} defaultZoom={value ? 16 : 12} mapId={googleMapsMapId} className="h-52 w-full rounded-xl" gestureHandling="greedy" onClick={async (event) => {
    if (!event.detail.latLng) return;
    const { lat, lng } = event.detail.latLng;
    onChange({ address: await addressAt(lat, lng, value?.address), lat, lon: lng });
  }}>
    <FocusPin value={value} />
    {value && <AdvancedMarker position={{ lat: value.lat, lng: value.lon }} draggable onDragEnd={async (event) => {
      if (!event.latLng) return;
      const lat = event.latLng.lat();
      const lon = event.latLng.lng();
      onChange({ address: await addressAt(lat, lon, value.address), lat, lon });
    }}><Pin background="#405f90" borderColor="#ffffff" glyphColor="#ffffff" /></AdvancedMarker>}
  </Map>;
}

export default function AddressPicker({ value, onChange, onReset, label = "Delivery address" }: { value: AddressPin | null; onChange: (pin: AddressPin) => void; onReset?: () => void; label?: string }) {
  if (!hasGoogleMapsConfig) return <div className="mb-3 space-y-2"><label className="block text-sm">{label}</label><MapSetupNotice /></div>;
  return <div className="mb-3 space-y-2"><label className="block text-sm">{label}</label><APIProvider apiKey={googleMapsApiKey} libraries={["places"]}><AddressSearch value={value} onChange={onChange} />{value && <div className="flex min-h-[38px] items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm text-emerald-950"><span className="min-w-0 flex-1 truncate"><span className="font-semibold">Selected address:</span> {value.address}</span>{onReset && <button type="button" onClick={onReset} className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700" aria-label="Clear selected client location">Clear</button>}</div>}<AddressMap value={value} onChange={onChange} /></APIProvider><p className="text-xs text-on-surface-variant">Choose a search result, or click or drag the pin to update the selected address.</p></div>;
}
