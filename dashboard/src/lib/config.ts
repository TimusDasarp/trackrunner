// Use Vite's same-origin proxy during development even when a shell-level
// staging URL is present. Production builds retain the injected public URL.
const configuredApiBaseUrl = import.meta.env.DEV
  ? ""
  : import.meta.env.VITE_API_BASE_URL?.trim();

/**
 * Empty means same-origin development proxy. Cloudflare Pages builds set this
 * to the public Render API origin (without a trailing slash).
 */
export const apiBaseUrl = configuredApiBaseUrl
  ? configuredApiBaseUrl.replace(/\/$/, "")
  : "";

/** Browser-restricted Google Maps key. This value is intentionally public at build time. */
export const googleMapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim() ?? "";

/** Required for Advanced Markers. Create this in the Google Maps Platform console. */
export const googleMapsMapId = import.meta.env.VITE_GOOGLE_MAP_ID?.trim() ?? "";

export const hasGoogleMapsConfig = Boolean(googleMapsApiKey && googleMapsMapId);

/** Set VITE_TASKS_WORKSPACE_ENABLED=false to hide the workspace during a staged rollout. */
export const tasksWorkspaceEnabled = import.meta.env.VITE_TASKS_WORKSPACE_ENABLED !== "false";

export function apiUrl(path: string): string {
  return `${apiBaseUrl}${path}`;
}
