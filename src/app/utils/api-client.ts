import { recordFailedRequest } from "./diagnostics-buffer";

/** Hosted production backend. */
export const PRODUCTION_API_URL = "https://assessment-integrity-backend-0w4b.onrender.com";

/**
 * Backend base URL. VITE_API_URL always wins. Without it, `npm run dev`
 * talks to the local backend (http://localhost:3000) and production builds
 * talk to the hosted backend, so a missing .env entry can never send local
 * development traffic to production.
 */
let rawApiUrl = import.meta.env.VITE_API_URL;
if (rawApiUrl && typeof rawApiUrl === "string" && !rawApiUrl.startsWith("http://") && !rawApiUrl.startsWith("https://")) {
  rawApiUrl = `https://${rawApiUrl}`;
}

export const API_BASE_URL: string =
  rawApiUrl || (import.meta.env.DEV ? "http://localhost:3000" : PRODUCTION_API_URL);

export async function apiFetch(
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  const url = endpoint.startsWith("http")
    ? endpoint
    : `${API_BASE_URL}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;

  const token = localStorage.getItem("auth_token");
  const headers = new Headers(options.headers || {});

  if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(url, {
    ...options,
    headers,
    credentials: options.credentials || "include",
  });
  if (!res.ok) recordFailedRequest(url, res.status);
  return res;
}
