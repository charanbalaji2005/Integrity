import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  LoaderCircle,
  Maximize,
  Minimize,
  MoveHorizontal,
  Printer,
  RotateCw,
  Share2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { downloadMaterial, fetchMaterialBlob, shareMaterial } from "./materialActions";

/**
 * Full-screen PDF reader built on pdf.js (renders on every device, unlike
 * <iframe> PDFs which Android Chrome cannot display).
 * Tools: page navigation, zoom, fit-to-width, rotate, fullscreen, print,
 * download, share. pdf.js is loaded lazily the first time a PDF is opened.
 */

type PdfDoc = import("pdfjs-dist").PDFDocumentProxy;

interface PdfViewerProps {
  material: { id: string; title: string; file?: { fileName: string }; section?: string; uploadedByName?: string };
  onClose: () => void;
}

const MIN_SCALE = 0.4;
const MAX_SCALE = 3;
const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round(s * 100) / 100));

let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null;
function loadPdfJs() {
  pdfjsPromise ??= (async () => {
    const pdfjs = await import("pdfjs-dist");
    const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    return pdfjs;
  })();
  return pdfjsPromise;
}

export function PdfViewer({ material, onClose }: PdfViewerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);

  const [blob, setBlob] = useState<Blob | null>(null);
  const [doc, setDoc] = useState<PdfDoc | null>(null);
  const [sizes, setSizes] = useState<{ w: number; h: number }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [fullscreen, setFullscreen] = useState(false);
  const fittedRef = useRef(false);

  // Load the file + document
  useEffect(() => {
    let cancelled = false;
    let loaded: PdfDoc | null = null;
    (async () => {
      try {
        const [file, pdfjs] = await Promise.all([fetchMaterialBlob(material.id), loadPdfJs()]);
        if (cancelled) return;
        setBlob(file);
        loaded = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
        if (cancelled) {
          loaded.destroy();
          return;
        }
        const s: { w: number; h: number }[] = [];
        for (let i = 1; i <= loaded.numPages; i++) {
          const vp = (await loaded.getPage(i)).getViewport({ scale: 1 });
          s.push({ w: vp.width, h: vp.height });
        }
        if (cancelled) return;
        setSizes(s);
        setDoc(loaded);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not open this PDF.");
      }
    })();
    return () => {
      cancelled = true;
      loaded?.destroy();
    };
  }, [material.id]);

  const rotated = rotation % 180 !== 0;
  const maxBaseWidth = useMemo(
    () => Math.max(1, ...sizes.map((s) => (rotated ? s.h : s.w))),
    [sizes, rotated],
  );

  const fitWidth = useCallback(() => {
    const el = scrollRef.current;
    if (!el || !sizes.length) return;
    setScale(clampScale((el.clientWidth - 32) / maxBaseWidth));
  }, [sizes.length, maxBaseWidth]);

  // Fit to width once the document is ready (sensible default on phones and desktops)
  useEffect(() => {
    if (doc && sizes.length && !fittedRef.current) {
      fittedRef.current = true;
      const el = scrollRef.current;
      if (el) setScale(clampScale(Math.min(1.25, (el.clientWidth - 32) / maxBaseWidth)));
    }
  }, [doc, sizes.length, maxBaseWidth]);

  // Track the current page while scrolling
  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const probe = el.scrollTop + el.clientHeight * 0.35;
    let current = 1;
    pageRefs.current.forEach((p, i) => {
      if (p && p.offsetTop <= probe) current = i + 1;
    });
    setPage(current);
    setPageInput(String(current));
  }, []);

  const goTo = useCallback(
    (n: number) => {
      if (!doc) return;
      const target = Math.min(doc.numPages, Math.max(1, n));
      pageRefs.current[target - 1]?.scrollIntoView({ behavior: "smooth", block: "start" });
      setPage(target);
      setPageInput(String(target));
    },
    [doc],
  );

  // Fullscreen
  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === rootRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else rootRef.current?.requestFullscreen?.().catch(() => {});
  };

  const print = () => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const frame = document.createElement("iframe");
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
    frame.src = url;
    frame.onload = () => {
      try {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
      } catch {
        window.open(url, "_blank", "noopener");
      }
      setTimeout(() => {
        frame.remove();
        URL.revokeObjectURL(url);
      }, 60_000);
    };
    document.body.appendChild(frame);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.key === "Escape" && !document.fullscreenElement) onClose();
      else if (e.key === "+" || e.key === "=") setScale((s) => clampScale(s + 0.15));
      else if (e.key === "-") setScale((s) => clampScale(s - 0.15));
      else if (e.key === "ArrowRight" || e.key === "PageDown") goTo(page + 1);
      else if (e.key === "ArrowLeft" || e.key === "PageUp") goTo(page - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, goTo, page]);

  // Lock background scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const tool =
    "size-9 shrink-0 items-center justify-center rounded-lg text-zinc-200 transition hover:bg-white/10 hover:text-white disabled:opacity-35 disabled:hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50";

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label={`PDF viewer: ${material.title}`}
      className="fixed inset-0 z-[100] flex flex-col bg-zinc-900"
    >
      {/* Toolbar */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-1 gap-y-1 border-b border-white/10 bg-zinc-950 px-2 py-1.5 text-white sm:h-14 sm:flex-nowrap sm:px-3 sm:py-0">
        <div className="order-1 mr-1 flex min-w-0 flex-1 items-center gap-2 sm:mr-3 sm:flex-none">
          <FileText className="hidden size-4 shrink-0 text-rose-300 sm:block" aria-hidden="true" />
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold sm:max-w-[22rem]">{material.title}</p>
            {(material.section || material.uploadedByName) && (
              <p className="hidden truncate text-[11px] text-zinc-400 sm:block">
                {[material.section && material.section !== "ALL" ? material.section : material.section === "ALL" ? "All sections" : null, material.uploadedByName]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
          </div>
        </div>

        <div className="order-3 flex w-full min-w-0 items-center justify-center gap-0.5 sm:order-2 sm:w-auto sm:flex-1">
          <button type="button" className={`${tool} inline-flex`} onClick={() => goTo(page - 1)} disabled={!doc || page <= 1} aria-label="Previous page" title="Previous page (←)">
            <ChevronLeft className="size-4" />
          </button>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              goTo(Number(pageInput) || 1);
            }}
            className="flex items-center gap-1 text-[12px] text-zinc-300"
          >
            <input
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value.replace(/\D/g, ""))}
              onBlur={() => setPageInput(String(page))}
              inputMode="numeric"
              aria-label="Page number"
              className="h-8 w-10 rounded-md border border-white/15 bg-white/5 text-center text-[12px] text-white outline-none focus:border-white/40"
            />
            <span className="whitespace-nowrap">/ {doc?.numPages ?? "–"}</span>
          </form>
          <button type="button" className={`${tool} inline-flex`} onClick={() => goTo(page + 1)} disabled={!doc || page >= (doc?.numPages ?? 1)} aria-label="Next page" title="Next page (→)">
            <ChevronRight className="size-4" />
          </button>

          <span className="mx-1 h-5 w-px shrink-0 bg-white/15" aria-hidden="true" />

          <button type="button" className={`${tool} inline-flex`} onClick={() => setScale((s) => clampScale(s - 0.15))} disabled={!doc || scale <= MIN_SCALE} aria-label="Zoom out" title="Zoom out (−)">
            <ZoomOut className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => setScale(1)}
            disabled={!doc}
            title="Reset to 100%"
            className="h-8 shrink-0 rounded-md px-1.5 text-[12px] font-semibold tabular-nums text-zinc-200 hover:bg-white/10 disabled:opacity-35"
          >
            {Math.round(scale * 100)}%
          </button>
          <button type="button" className={`${tool} inline-flex`} onClick={() => setScale((s) => clampScale(s + 0.15))} disabled={!doc || scale >= MAX_SCALE} aria-label="Zoom in" title="Zoom in (+)">
            <ZoomIn className="size-4" />
          </button>
          <button type="button" className={`${tool} inline-flex`} onClick={fitWidth} disabled={!doc} aria-label="Fit to width" title="Fit to width">
            <MoveHorizontal className="size-4" />
          </button>
          <button type="button" className={`${tool} inline-flex`} onClick={() => setRotation((r) => (r + 90) % 360)} disabled={!doc} aria-label="Rotate" title="Rotate 90°">
            <RotateCw className="size-4" />
          </button>
          <button type="button" className={`${tool} hidden sm:inline-flex`} onClick={toggleFullscreen} aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"} title={fullscreen ? "Exit fullscreen" : "Fullscreen"}>
            {fullscreen ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
          </button>

        </div>

        <div className="order-2 flex shrink-0 items-center gap-0.5 sm:order-3">
          <button type="button" className={`${tool} hidden sm:inline-flex`} onClick={print} disabled={!blob} aria-label="Print" title="Print">
            <Printer className="size-4" />
          </button>
          <button type="button" className={`${tool} inline-flex`} onClick={() => downloadMaterial(material, blob ?? undefined)} disabled={!blob} aria-label="Download" title="Download PDF">
            <Download className="size-4" />
          </button>
          <button type="button" className={`${tool} inline-flex`} onClick={() => shareMaterial(material, blob ?? undefined)} aria-label="Share" title="Share">
            <Share2 className="size-4" />
          </button>
          <span className="mx-1 hidden h-5 w-px bg-white/15 sm:block" aria-hidden="true" />
        <button type="button" className={`${tool} inline-flex`} onClick={onClose} aria-label="Close viewer" title="Close (Esc)">
          <X className="size-5" />
        </button>
        </div>
      </div>

      {/* Pages */}
      <div ref={scrollRef} onScroll={onScroll} className="relative flex-1 overflow-auto bg-zinc-800">
        {error ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-zinc-200" role="alert">
            <FileText className="size-10 text-rose-300" aria-hidden="true" />
            <p className="max-w-sm text-sm">{error}</p>
            <button type="button" onClick={onClose} className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-zinc-900">
              Close
            </button>
          </div>
        ) : !doc ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-zinc-300">
            <LoaderCircle className="size-7 animate-spin" aria-hidden="true" />
            <p className="text-sm">Opening PDF…</p>
          </div>
        ) : (
          <div className="flex min-w-max flex-col items-center gap-4 px-4 py-5">
            {sizes.map((s, i) => (
              <div key={i} ref={(el) => (pageRefs.current[i] = el)}>
                <PdfPage
                  doc={doc}
                  pageNumber={i + 1}
                  scale={scale}
                  rotation={rotation}
                  width={(rotated ? s.h : s.w) * scale}
                  height={(rotated ? s.w : s.h) * scale}
                  scrollRoot={scrollRef}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** One page, rendered only when it is near the viewport. */
function PdfPage({
  doc,
  pageNumber,
  scale,
  rotation,
  width,
  height,
  scrollRoot,
}: {
  doc: PdfDoc;
  pageNumber: number;
  scale: number;
  rotation: number;
  width: number;
  height: number;
  scrollRoot: React.RefObject<HTMLDivElement | null>;
}) {
  const holderRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [near, setNear] = useState(false);
  const [rendering, setRendering] = useState(false);

  useEffect(() => {
    const el = holderRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setNear(e.isIntersecting), {
      root: scrollRoot.current,
      rootMargin: "800px 0px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, [scrollRoot]);

  useEffect(() => {
    if (!near) return;
    let cancelled = false;
    let task: { cancel: () => void; promise: Promise<void> } | null = null;
    setRendering(true);
    (async () => {
      try {
        const page = await doc.getPage(pageNumber);
        if (cancelled) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const viewport = page.getViewport({ scale: scale * dpr, rotation });
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx) return;
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        task = page.render({ canvasContext: ctx, viewport });
        await task.promise;
      } catch (err) {
        // RenderingCancelledException is expected when zoom/rotation changes mid-render
        if (!(err instanceof Error && err.name === "RenderingCancelledException")) console.warn("[PdfViewer]", err);
      } finally {
        if (!cancelled) setRendering(false);
      }
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [near, doc, pageNumber, scale, rotation]);

  return (
    <div
      ref={holderRef}
      className="relative bg-white shadow-[0_6px_24px_rgba(0,0,0,0.45)]"
      style={{ width, height }}
      aria-label={`Page ${pageNumber}`}
    >
      <canvas ref={canvasRef} className="block" style={{ width, height }} />
      {rendering && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/60" aria-hidden="true">
          <LoaderCircle className="size-5 animate-spin text-zinc-400" />
        </div>
      )}
    </div>
  );
}
