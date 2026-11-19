import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { reportViolation } from "../report-violation";
import type { BrowserSignals } from "../types";

const TOAST_COOLDOWN_MS = 3000;
/** How many distinct snippets the student copied from their own answers we remember. */
const MAX_INTERNAL_SNIPPETS = 25;

/** Answer areas are marked with this attribute in the exam view. */
export const EXAM_ANSWER_ATTR = "data-exam-answer";

const normalize = (t: string) => t.replace(/\r\n?/g, "\n").replace(/ /g, " ").trim();

/** The editable answer field an event belongs to, or null if it isn't one. */
function answerField(target: EventTarget | null): HTMLElement | null {
  const el = target instanceof Element ? target : target instanceof Node ? target.parentElement : null;
  const field = el?.closest<HTMLElement>('textarea, input, [contenteditable=""], [contenteditable="true"]');
  return field && field.closest(`[${EXAM_ANSWER_ATTR}]`) ? field : null;
}

/** Text the student has selected inside that field (never anything outside it). */
function selectionIn(field: HTMLElement): string {
  if (field instanceof HTMLTextAreaElement || field instanceof HTMLInputElement) {
    const { selectionStart: s, selectionEnd: e, value } = field;
    return s !== null && e !== null && e > s ? value.slice(s, e) : "";
  }
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return "";
  const range = sel.getRangeAt(0);
  return field.contains(range.startContainer) && field.contains(range.endContainer) ? sel.toString() : "";
}

/**
 * Framework-free clipboard guard (installed by the hook below; also used in
 * tests). Returns a cleanup function.
 */
export function installClipboardGuard(opts: {
  blockClipboard: boolean;
  blockContextMenu: boolean;
  onBlocked: (message: string, logLabel: string) => void;
  doc?: Document;
}): () => void {
  const doc = opts.doc ?? document;
  /** Snippets copied from the student's own answers during this session. */
  const internal: string[] = [];

  const remember = (text: string) => {
    const t = normalize(text);
    if (!t) return;
    const i = internal.indexOf(t);
    if (i !== -1) internal.splice(i, 1);
    internal.push(t);
    if (internal.length > MAX_INTERNAL_SNIPPETS) internal.shift();
  };
  const isInternal = (text: string) => {
    const t = normalize(text);
    return t.length > 0 && internal.includes(t);
  };
  const block = (e: Event, message: string, logLabel: string) => {
    e.preventDefault();
    opts.onBlocked(message, logLabel);
  };

  const onCopyOrCut = (e: ClipboardEvent) => {
    const field = answerField(e.target);
    const text = field ? selectionIn(field) : "";
    if (field && text) {
      remember(text); // own answer text: allowed
      return;
    }
    block(e, "Copying questions or exam content is disabled.", `${e.type} of exam content`);
  };

  const onPaste = (e: ClipboardEvent) => {
    const field = answerField(e.target);
    const text = e.clipboardData?.getData("text/plain") ?? "";
    if (field && isInternal(text)) return; // pasting the student's own words back: allowed
    block(e, "Pasting text from outside your answers is blocked.", "paste of external content");
  };

  const onDragStart = (e: DragEvent) => {
    const field = answerField(e.target);
    const text = field ? selectionIn(field) : "";
    if (field && text) remember(text);
    else e.preventDefault(); // don't let question text be dragged out
  };

  const onDrop = (e: DragEvent) => {
    const field = answerField(e.target);
    const text = e.dataTransfer?.getData("text/plain") ?? "";
    if (field && isInternal(text)) return;
    if (!field && !text) return; // stray drop of nothing onto the page
    block(e, "Dropping text from outside your answers is blocked.", "drop of external content");
  };

  const onContextMenu = (e: MouseEvent) => block(e, "Right-click is disabled during the examination.", "right-click");

  const listeners: [string, EventListener][] = [];
  if (opts.blockClipboard) {
    listeners.push(
      ["copy", onCopyOrCut as EventListener],
      ["cut", onCopyOrCut as EventListener],
      ["paste", onPaste as EventListener],
      ["dragstart", onDragStart as EventListener],
      ["drop", onDrop as EventListener],
    );
  }
  if (opts.blockContextMenu) listeners.push(["contextmenu", onContextMenu as EventListener]);
  listeners.forEach(([type, fn]) => doc.addEventListener(type, fn, true));
  return () => listeners.forEach(([type, fn]) => doc.removeEventListener(type, fn, true));
}

/**
 * Clipboard Agent.
 * Students may copy, cut and paste *within their own answers*. Everything
 * else is blocked and logged: copying question text or exam materials,
 * pasting (or dropping) text that did not come from their own answers —
 * e.g. from another app, website or AI tool — and, if enabled, the context
 * menu. Blocked attempts are queued in the shared browser signals and
 * delivered to the server-side Browser Monitoring Agent (CLIPBOARD_ATTEMPT).
 */
export function useClipboardAgent(params: {
  active: boolean;
  attemptId: string | null;
  userId: string;
  signalsRef: React.MutableRefObject<BrowserSignals>;
  streamActive: boolean;
  /** Per-exam rules; both default to on (legacy behaviour). */
  blockClipboard?: boolean;
  blockContextMenu?: boolean;
}) {
  const { active, attemptId, userId, signalsRef, streamActive } = params;
  const blockClipboard = params.blockClipboard ?? true;
  const blockContextMenu = params.blockContextMenu ?? true;
  const [attempts, setAttempts] = useState(0);
  const streamActiveRef = useRef(streamActive);
  streamActiveRef.current = streamActive;

  useEffect(() => {
    if (!active || !attemptId) return;
    let lastToastAt = 0;
    return installClipboardGuard({
      blockClipboard,
      blockContextMenu,
      onBlocked: (message, logLabel) => {
        signalsRef.current.pendingClipboard += 1;
        setAttempts((n) => n + 1);
        const now = Date.now();
        if (now - lastToastAt > TOAST_COOLDOWN_MS) {
          lastToastAt = now;
          toast.warning(`${message} This attempt was logged.`);
        }
        if (!streamActiveRef.current) {
          void reportViolation(attemptId, userId, "clipboard-attempt", "low", `Blocked ${logLabel}.`);
        }
      },
    });
  }, [active, attemptId, userId, signalsRef, blockClipboard, blockContextMenu]);

  return { attempts };
}
