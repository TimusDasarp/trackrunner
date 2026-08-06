const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();

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
