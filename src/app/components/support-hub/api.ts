import { apiFetch } from "../../utils/api-client";

const BASE = "/api/support";

export class SupportApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/**
 * Calls a Support Hub endpoint and unwraps the `{ success, message, data }` envelope.
 * Throws SupportApiError carrying the server's `message` on failure.
 */
export async function supportApi<T>(
  path: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {}
): Promise<T> {
  const { method = "GET", body, signal } = options;
  const init: RequestInit = { method, signal };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) init.body = JSON.stringify(body);

  let res: Response;
  try {
    res = await apiFetch(`${BASE}${path}`, init);
  } catch (err) {
    if ((err as Error)?.name === "AbortError") throw err;
    throw new SupportApiError("Network error — could not reach the support service.", 0);
  }

  let json: any = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON */
  }
  if (!res.ok || (json && json.success === false)) {
    const message = json?.message || `Request failed (${res.status})`;
    throw new SupportApiError(message, res.status);
  }
  return (json?.data ?? json) as T;
}

/** Downloads a non-JSON response (e.g. CSV export) as a file. */
export async function supportDownload(path: string, fileName: string): Promise<void> {
  const res = await apiFetch(`${BASE}${path}`, { headers: { Accept: "text/csv" } });
  if (!res.ok) {
    let message = `Export failed (${res.status})`;
    try {
      const j = await res.json();
      if (j?.message) message = j.message;
    } catch {
      /* ignore */
    }
    throw new SupportApiError(message, res.status);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function errorMessage(err: unknown, fallback = "Something went wrong"): string {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
