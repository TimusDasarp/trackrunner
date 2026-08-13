import { useEffect, useRef } from "react";
import { AdvancedMarker, APIProvider, Map, Pin, useMap, useMapsLibrary } from "@vis.gl/react-google-maps";
import { googleMapsApiKey, googleMapsMapId, hasGoogleMapsConfig } from "../lib/config";
import { MapSetupNotice } from "./RunnerMap";

export type AddressPin = { address: string; lat: number; lon: number };

function AddressSearch({ value, onChange }: { value: AddressPin | null; onChange: (pin: AddressPin) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const places = useMapsLibrary("places");

  useEffect(() => {
    if (!places || !inputRef.current) return;
    const autocomplete = new places.Autocomplete(inputRef.current, { fields: ["formatted_address", "geometry", "name"], types: ["geocode", "establishment"] });
    const listener = autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      const location = place.geometry?.location;
      if (!location) return;
      onChange({ address: place.formatted_address ?? place.name ?? "Pinned location", lat: location.lat(), lon: location.lng() });
    });
    return () => listener.remove();
  }, [places, onChange]);

  useEffect(() => { if (inputRef.current) inputRef.current.value = value?.address ?? ""; }, [value?.address]);
  return <input ref={inputRef} className="w-full rounded-xl border border-[#777680] bg-transparent px-3 py-2" defaultValue={value?.address ?? ""} placeholder="Search an address or landmark" />;
}

function FocusPin({ value }: { value: AddressPin | null }) {
  const map = useMap();
  useEffect(() => { if (map && value) { map.panTo({ lat: value.lat, lng: value.lon }); map.setZoom(16); } }, [map, value?.lat, value?.lon]);
  return null;
}

function AddressMap({ value, onChange }: { value: AddressPin | null; onChange: (pin: AddressPin) => void }) {
  const center = value ? { lat: value.lat, lng: value.lon } : { lat: 12.9716, lng: 77.5946 };
  return <Map defaultCenter={center} defaultZoom={value ? 16 : 12} mapId={googleMapsMapId} className="h-52 w-full rounded-xl" gestureHandling="greedy" onClick={(event) => {
    if (!event.detail.latLng) return;
    onChange({ address: value?.address ?? "Pinned location", lat: event.detail.latLng.lat, lon: event.detail.latLng.lng });
  }}>
    <FocusPin value={value} />
    {value && <AdvancedMarker position={{ lat: value.lat, lng: value.lon }} draggable onDragEnd={(event) => {
      if (event.latLng) onChange({ ...value, lat: event.latLng.lat(), lon: event.latLng.lng() });
    }}><Pin background="#405f90" borderColor="#ffffff" glyphColor="#ffffff" /></AdvancedMarker>}
  </Map>;
}

export default function AddressPicker({ value, onChange }: { value: AddressPin | null; onChange: (pin: AddressPin) => void }) {
  if (!hasGoogleMapsConfig) return <div className="mb-3 space-y-2"><label className="block text-sm">Delivery address</label><MapSetupNotice /></div>;
  return <div className="mb-3 space-y-2"><label className="block text-sm">Delivery address</label><APIProvider apiKey={googleMapsApiKey} libraries={["places"]}><AddressSearch value={value} onChange={onChange} /><AddressMap value={value} onChange={onChange} /></APIProvider><p className="text-xs text-on-surface-variant">Search then choose an address, or click or drag the pin to set the delivery location.</p></div>;
}
