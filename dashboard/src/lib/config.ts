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

export function apiUrl(path: string): string {
  return `${apiBaseUrl}${path}`;
}
