/**
 * Tiny in-memory ring buffer of recently failed API requests, used only for
 * the opt-in support diagnostics. Stores the request path (no host, query
 * string, fragment or body), the HTTP status and a timestamp.
 */
export interface FailedRequest {
  path: string;
  status: number;
  at: string;
}

const MAX_ENTRIES = 10;
const buffer: FailedRequest[] = [];

function toPath(url: string): string {
  try {
    return new URL(url, "http://local").pathname;
  } catch {
    return String(url).split(/[?#]/)[0];
  }
}

export function recordFailedRequest(url: string, status: number): void {
  buffer.push({ path: toPath(url), status, at: new Date().toISOString() });
  if (buffer.length > MAX_ENTRIES) buffer.splice(0, buffer.length - MAX_ENTRIES);
}

export function getRecentFailedRequests(): FailedRequest[] {
  return buffer.map((e) => ({ ...e }));
}
