import React, { useEffect, useState } from "react";
import { ImageOff, Loader2 } from "lucide-react";
import { apiFetch } from "../../utils/api-client";

/**
 * Protected files are fetched with the session (cookie or bearer token) and shown
 * through object URLs. Plain <img src> / <a href> to the API would fail when the
 * frontend and backend live on different sites and third-party cookies are blocked.
 */

const cache = new Map<string, Promise<string>>();

export function fetchObjectUrl(path: string): Promise<string> {
  const hit = cache.get(path);
  if (hit) return hit;
  const p = apiFetch(path).then(async (res) => {
    if (!res.ok) {
      let message = `Request failed (${res.status})`;
      try {
        message = (await res.json()).message || message;
      } catch {
        /* not JSON */
      }
      throw new Error(message);
    }
    return URL.createObjectURL(await res.blob());
  });
  cache.set(path, p);
  p.catch(() => cache.delete(path));
  return p;
}

export const questionImagePath = (id: string) => `/api/courses/files/${id}`;

export function AuthedImage({ fileId, alt, className }: { fileId: string; alt: string; className?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    setFailed(false);
    fetchObjectUrl(questionImagePath(fileId))
      .then((u) => live && setSrc(u))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [fileId]);
  if (failed)
    return (
      <div className={`flex items-center justify-center gap-2 text-xs opacity-70 ${className ?? ""}`}>
        <ImageOff className="size-4" /> Image unavailable
      </div>
    );
  if (!src)
    return (
      <div className={`flex items-center justify-center ${className ?? ""}`}>
        <Loader2 className="size-4 animate-spin opacity-60" />
      </div>
    );
  return <img src={src} alt={alt} className={className} />;
}

/** Opens (inline) or downloads a protected file. Opens the tab first so popup blockers allow it. */
export async function openProtectedFile(path: string, fileName: string, download = false) {
  const win = download ? null : window.open("", "_blank");
  try {
    const url = await fetchObjectUrl(`${path}${download ? (path.includes("?") ? "&" : "?") + "download=1" : ""}`);
    if (download) {
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } else if (win) {
      win.location.href = url;
    } else {
      window.open(url, "_blank", "noopener");
    }
  } catch (err) {
    win?.close();
    throw err;
  }
}
