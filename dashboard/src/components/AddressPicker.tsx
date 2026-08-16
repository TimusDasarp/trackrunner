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
    autocomplete.setAttribute("placeholder", "Search an India address or landmark");
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

  return <div className="rounded-xl border border-[#777680] bg-transparent px-3 py-2 text-ink transition focus-within:border-accent focus-within:ring-1 focus-within:ring-accent/20" aria-label={value?.address ? `Selected delivery address: ${value.address}` : "Delivery address search"}><div ref={containerRef} /></div>;
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
