import React, { useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  BookOpen,
  Search,
  Rocket,
  BadgeCheck,
  Monitor,
  ScanFace,
  Eye,
  AlertTriangle,
  Wifi,
  Lock,
  HelpCircle,
  LifeBuoy,
  ChevronDown,
  X,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { openSettings } from "../../settings/SettingsCenter";
import type { SettingsSectionId } from "../../settings/roles";

interface StudentDocumentationProps {
  onNavigate: (tab: string) => void;
  onOpenVerify: () => void;
}

type Article = {
  id: string;
  title: string;
  body: React.ReactNode;
  /** Plain-text keywords used by search (body is JSX). */
  keywords: string;
  link?: { label: string; tab?: string; settings?: SettingsSectionId; verify?: boolean };
};

type Category = { id: string; label: string; icon: LucideIcon; articles: Article[] };

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a1917] focus-visible:ring-offset-2";
const P = ({ children }: { children: React.ReactNode }) => <p className="text-[13px] text-[#4a4a4a] leading-relaxed">{children}</p>;
const UL = ({ items }: { items: React.ReactNode[] }) => (
  <ul className="list-disc pl-5 space-y-1.5 text-[13px] text-[#4a4a4a] leading-relaxed marker:text-[#b2b2b2]">
    {items.map((it, i) => (
      <li key={i}>{it}</li>
    ))}
  </ul>
);
const OL = ({ items }: { items: React.ReactNode[] }) => (
  <ol className="list-decimal pl-5 space-y-1.5 text-[13px] text-[#4a4a4a] leading-relaxed marker:text-[#8a8a8a] marker:font-semibold">
    {items.map((it, i) => (
      <li key={i}>{it}</li>
    ))}
  </ol>
);
const B = ({ children }: { children: React.ReactNode }) => <strong className="font-semibold text-[#1a1917]">{children}</strong>;

const CATEGORIES: Category[] = [
  {
    id: "start",
    label: "Getting started",
    icon: Rocket,
    articles: [
      {
        id: "dashboard-tour",
        title: "A quick tour of your dashboard",
        keywords: "overview live sessions messages integrity reports history insights plagiarism support",
        body: (
          <UL
            items={[
              <><B>Overview</B>: your integrity score, GPA, attendance and completion, calculated from your attempts.</>,
              <><B>Live Sessions</B>: assessments published for your institution. Start, resume or download certificates here.</>,
              <><B>Integrity Reports</B>: per-attempt reports with flagged events and faculty feedback.</>,
              <><B>AI Insights</B> and <B>History</B>: your trends, what affected your integrity, and every attempt with its timeline.</>,
              <><B>Messages</B> and <B>Support</B>: talk to faculty, or raise a support ticket.</>,
            ]}
          />
        ),
      },
      {
        id: "first-exam",
        title: "Taking your first exam, step by step",
        keywords: "start exam steps webcam photo calibration fullscreen begin",
        body: (
          <OL
            items={[
              <>Make sure your enrolment is <B>verified</B> (see Enrolment verification).</>,
              <>Open <B>Live Sessions</B> and click <B>Start Secure Exam</B>.</>,
              <>Allow camera access. The system check confirms your webcam works; webcam access is required.</>,
              <>Capture your photo. The face check must find exactly your face before you can continue.</>,
              <>Calibrate: look at the screen normally for the short countdown so the proctor learns your posture.</>,
              <>The exam opens in <B>full screen</B>. Answer, then submit. If time runs out, your answers are submitted automatically.</>,
            ]}
          />
        ),
        link: { label: "Go to Live Sessions", tab: "Live Sessions" },
      },
    ],
  },
  {
    id: "verification",
    label: "Enrolment verification",
    icon: BadgeCheck,
    articles: [
      {
        id: "why-verify",
        title: "Why do I need to verify my enrolment?",
        keywords: "verify enrolment locked exams approval admin",
        body: (
          <P>
            Exams are locked until an administrator confirms you're enrolled at your institution. Until then, the Start button shows
            <B> Verify to start</B>. The check is also enforced on the server, so it can't be skipped.
          </P>
        ),
      },
      {
        id: "upload-docs",
        title: "Uploading your college ID or fee receipt",
        keywords: "upload college id card fee receipt document jpg png pdf 10 mb roll number",
        body: (
          <>
            <OL
              items={[
                <>Click <B>Verify</B> on the banner at the top of your dashboard.</>,
                <>Choose a document type: <B>College ID card</B> (front side, with your photo and name clearly visible) or <B>Institution fee receipt</B> (current semester, showing your name and institution).</>,
                <>Upload a <B>JPG, PNG or PDF up to 10 MB</B>. Adding your roll number is optional but helps the reviewer.</>,
                <>Submit. Your status changes to <B>Pending</B> while an admin reviews it.</>,
              ]}
            />
            <div className="mt-3">
              <P>Use a sharp, well-lit image with all four corners visible. Blurry or cropped documents are the most common reason for rejection.</P>
            </div>
          </>
        ),
        link: { label: "Upload document", verify: true },
      },
      {
        id: "verified-badge",
        title: "Approval, the verified badge and rejections",
        keywords: "approved verified badge institution pending rejected review note resubmit",
        body: (
          <UL
            items={[
              <><B>Approved</B>: exams unlock immediately, a verified badge appears next to your name, and your institution is shown in the header.</>,
              <><B>Pending</B>: an admin hasn't reviewed it yet. You'll see a pending badge; no action needed.</>,
              <><B>Rejected</B>: read the reviewer's note on the banner, then upload a clearer or more recent document.</>,
            ]}
          />
        ),
      },
    ],
  },
  {
    id: "setup",
    label: "System & camera setup",
    icon: Monitor,
    articles: [
      {
        id: "requirements",
        title: "System requirements",
        keywords: "requirements browser chrome edge firefox laptop desktop webcam internet microphone",
        body: (
          <UL
            items={[
              <>A laptop or desktop with an up-to-date Chrome, Edge or Firefox browser.</>,
              <>A working <B>webcam</B> (required). A microphone is needed only if your assessment enables audio analysis.</>,
              <>A stable internet connection. The proctor sends camera frames throughout the exam.</>,
              <>A quiet, well-lit, private room with a clear desk.</>,
            ]}
          />
        ),
      },
      {
        id: "camera-setup",
        title: "Choosing and testing your camera",
        keywords: "camera webcam select test preview quality permission blocked settings face id",
        body: (
          <>
            <P>
              Open <B>Settings → Camera &amp; Face ID</B> to pick the webcam used for identity checks and exams, preview it, test face detection,
              and lower image quality if your connection is slow.
            </P>
            <div className="mt-3">
              <UL
                items={[
                  <>If the browser blocked the camera, click the camera icon in the address bar and choose <B>Allow</B>, then reload.</>,
                  <>Close other apps that use the camera (video calls, camera apps) before starting.</>,
                  <>Place the camera at eye level with light in front of you, not behind.</>,
                ]}
              />
            </div>
          </>
        ),
        link: { label: "Open camera settings", settings: "camera" },
      },
      {
        id: "calibration",
        title: "What is calibration?",
        keywords: "calibration baseline posture countdown false alarms keyboard scratchpad enrol identity",
        body: (
          <P>
            Webcams sit at different heights and angles. Before the exam, a short countdown records your normal posture as a baseline, so
            glancing at your keyboard or scratch paper doesn't cause false alarms. Your face is also enrolled for identity checks during the
            exam. Sit as you will during the exam and look at the screen. If calibration fails, improve the lighting and try again.
          </P>
        ),
      },
    ],
  },
  {
    id: "proctor",
    label: "What the AI proctor monitors",
    icon: Eye,
    articles: [
      {
        id: "camera-signals",
        title: "Camera signals",
        keywords: "face presence multiple faces gaze looking away head pose eyes closed speech talking phone book earphones screen object liveness identity",
        body: (
          <UL
            items={[
              <><B>Face presence</B>: no face visible in the frame.</>,
              <><B>Multiple faces</B>: more than one person in view.</>,
              <><B>Looking away</B>: head turned away from the screen for longer than a short window. Natural downward glances at a scratch pad are not treated as misconduct.</>,
              <><B>Possible speech</B> and <B>prolonged eye closure</B>.</>,
              <><B>Prohibited objects</B>: mobile phones, second screens, books and earphones.</>,
              <><B>Liveness</B>: signs that a photo or replay is being shown instead of a live person.</>,
              <><B>Identity re-checks</B>: your face is checked against the face enrolled at calibration throughout the exam.</>,
              <><B>Camera quality</B>: a dark, blurred or covered camera is logged as a monitoring gap, not as misconduct.</>,
            ]}
          />
        ),
      },
      {
        id: "browser-signals",
        title: "Browser and device signals",
        keywords: "tab switch minimise focus window blur fullscreen exit developer tools devtools f12 copy paste right click network microphone camera disconnect noise",
        body: (
          <UL
            items={[
              <><B>Tab switches and minimising</B> the exam window.</>,
              <><B>Window focus loss</B> to another app or pop-up.</>,
              <><B>Leaving full screen</B>. The exam asks you to re-enter, and the number of exits is counted.</>,
              <><B>Developer tools</B>: F12, Ctrl+Shift+I/J/C and Ctrl+U are blocked and logged.</>,
              <><B>Copy, cut, paste and right-click</B> are blocked and logged.</>,
              <><B>Connection and devices</B>: internet loss, slow network, and camera or microphone disconnects.</>,
              <><B>Background noise</B>, only when the assessment enables microphone analysis.</>,
            ]}
          />
        ),
      },
      {
        id: "integrity-score",
        title: "How your integrity score works",
        keywords: "integrity score index 100 deducted points risk",
        body: (
          <P>
            Every attempt starts at an integrity index of <B>100</B>. Confirmed proctoring events reduce it, and more serious events (for
            example multiple faces or developer tools) reduce it more than minor ones. You can see what was recorded for each attempt in
            <B> History</B> and <B>Integrity Reports</B>. Proctoring results support your faculty's decision; the system never makes a final
            misconduct decision on its own.
          </P>
        ),
        link: { label: "See your History", tab: "History" },
      },
    ],
  },
  {
    id: "warnings",
    label: "Warnings & pauses",
    icon: AlertTriangle,
    articles: [
      {
        id: "warnings",
        title: "What happens when I get a warning?",
        keywords: "warning alert notice count message",
        body: (
          <P>
            When the proctor confirms an event, you see a warning on screen explaining what was detected (for example "Face Not Detected").
            Your warning count goes up and the event is added to your attempt's timeline. Fix the cause and carry on. The exam keeps running.
          </P>
        ),
      },
      {
        id: "pauses",
        title: "Why was my exam paused?",
        keywords: "paused pause suspended phone second screen face absent multiple people identity mismatch faculty resume terminate",
        body: (
          <>
            <P>Serious events pause the exam automatically until a faculty member reviews it:</P>
            <div className="mt-2">
              <UL
                items={[
                  <>A <B>mobile phone or second screen</B> is detected.</>,
                  <>Your <B>face is absent</B> for more than about 8 seconds.</>,
                  <><B>More than one person</B> is in view for more than about 5 seconds.</>,
                  <>Your face <B>no longer matches</B> the enrolled student.</>,
                ]}
              />
            </div>
            <div className="mt-2">
              <P>Stay in front of the camera. Faculty can resume your exam, issue a warning, or end it. If you think it was a mistake, raise an "Integrity Report Clarification" ticket in Support.</P>
            </div>
          </>
        ),
        link: { label: "Contact support", tab: "Support" },
      },
    ],
  },
  {
    id: "resume",
    label: "Disconnects & resuming",
    icon: Wifi,
    articles: [
      {
        id: "disconnect",
        title: "My internet dropped during the exam",
        keywords: "internet offline disconnect reconnect sync answers saved",
        body: (
          <P>
            Answers you enter while offline are kept in your browser and synced automatically when the connection returns ("Answers
            synced successfully"). The disconnect is recorded on your timeline for transparency. Don't close the tab; wait for the connection
            to come back.
          </P>
        ),
      },
      {
        id: "resume-exam",
        title: "Resuming an exam after closing the tab or a crash",
        keywords: "resume exam closed tab crash browser restart in progress saved progress question",
        body: (
          <>
            <OL
              items={[
                <>Go back to <B>Live Sessions</B>. The exam shows <B>Resume Exam</B>.</>,
                <>Allow the camera again. Proctoring restarts before the exam reopens; you'll recalibrate if needed.</>,
                <>Your saved answers, current question, flagged questions and remaining time are restored.</>,
              ]}
            />
            <div className="mt-2">
              <P>Each resume is counted and visible to your faculty, so only resume when you really need to.</P>
            </div>
          </>
        ),
        link: { label: "Go to Live Sessions", tab: "Live Sessions" },
      },
      {
        id: "camera-lost",
        title: "My camera disconnected",
        keywords: "camera disconnected lost reconnect usb",
        body: (
          <P>
            If the camera stream ends, the event is logged and you're asked to reconnect the camera. Plug it back in or close the app that
            took it, then use the reconnect option on screen. The exam can't stay unmonitored, so reconnect as soon as possible.
          </P>
        ),
      },
    ],
  },
  {
    id: "privacy",
    label: "Privacy",
    icon: Lock,
    articles: [
      {
        id: "data-collected",
        title: "What is recorded and who can see it",
        keywords: "privacy recording video frames biometric data faculty admin retention",
        body: (
          <UL
            items={[
              <>Your camera is monitored and the session is recorded only while an exam is running.</>,
              <>Recordings, detections and timelines are stored with your attempt. Faculty and administrators use them to review flagged sessions.</>,
              <>Biometric data (your face) is used only to verify your identity for exams.</>,
              <>Proctoring results are decision support. Final decisions are always made by faculty.</>,
            ]}
          />
        ),
        link: { label: "Open privacy settings", settings: "privacy" },
      },
      {
        id: "your-data",
        title: "Downloading or deleting your data",
        keywords: "download data export delete account request",
        body: (
          <P>
            In <B>Settings → Privacy &amp; data</B> you can download your profile and login history as a JSON file, reset settings saved on
            this device, or request account deletion. Exam records your institution is required to keep may be retained.
          </P>
        ),
        link: { label: "Open privacy settings", settings: "privacy" },
      },
    ],
  },
  {
    id: "faq",
    label: "FAQs",
    icon: HelpCircle,
    articles: [
      {
        id: "faq-glance",
        title: "Will looking at my keyboard or notes get me flagged?",
        keywords: "keyboard glance scratch paper notes looking down",
        body: <P>Short, natural glances down at your keyboard or scratch paper are expected; calibration exists to prevent these false alarms. Long periods looking away from the screen are flagged.</P>,
      },
      {
        id: "faq-no-exams",
        title: "Why don't I see any exams?",
        keywords: "no exams missing assessments institution published",
        body: <P>You only see published assessments for your institution. Check that the institution on your profile is correct and that your enrolment is verified. If an exam is still missing, ask your faculty whether it has been published.</P>,
      },
      {
        id: "faq-score-pending",
        title: "My score says Pending",
        keywords: "score pending graded evaluation faculty review",
        body: <P>Your attempt was submitted and is waiting for evaluation. Some answers are graded by faculty, so scores appear once grading is finished. Your provisional certificate is available as soon as you submit.</P>,
      },
      {
        id: "faq-dispute",
        title: "I think a flag was a mistake",
        keywords: "dispute appeal false positive wrong flag clarification",
        body: <P>Open <B>Support</B> and raise a ticket in the <B>Integrity Report Clarification</B> category with the exam name and roughly when it happened. Flags are reviewed by people, and evidence is kept so decisions can be reviewed and appealed.</P>,
        link: { label: "Raise a ticket", tab: "Support" },
      },
      {
        id: "faq-phone",
        title: "Can I take the exam on my phone?",
        keywords: "phone mobile tablet device",
        body: <P>Use a laptop or desktop. Exams need full screen, a steady camera view of your face, and a browser that supports tab and focus monitoring. A phone in view during the exam is treated as a prohibited object.</P>,
      },
    ],
  },
  {
    id: "contact",
    label: "Contact support",
    icon: LifeBuoy,
    articles: [
      {
        id: "contact-support",
        title: "How to get help",
        keywords: "contact support ticket help desk priority exam blocker chat",
        body: (
          <UL
            items={[
              <>Open <B>Support</B> and file a ticket. Pick the category that fits: Technical, Assessment, Account recovery or Integrity Report clarification.</>,
              <>Choose <B>High priority (Exam blocker)</B> only if you're blocked from taking an exam right now.</>,
              <>The AI assistant replies first, and a support representative can join the same conversation.</>,
              <>For questions about exam content or grading, message your faculty in <B>Messages</B>.</>,
            ]}
          />
        ),
        link: { label: "Open Support", tab: "Support" },
      },
    ],
  },
];

function textOf(node: React.ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(" ");
  if (React.isValidElement(node)) {
    const props = node.props as { children?: React.ReactNode; items?: React.ReactNode[] };
    return `${textOf(props.children)} ${props.items ? textOf(props.items) : ""}`;
  }
  return "";
}

export function StudentDocumentation({ onNavigate, onOpenVerify }: StudentDocumentationProps) {
  const [query, setQuery] = useState("");
  const [activeCat, setActiveCat] = useState<string>(CATEGORIES[0].id);
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set([CATEGORIES[0].articles[0].id]));
  const [mobileCatsOpen, setMobileCatsOpen] = useState(false);

  const index = useMemo(
    () => CATEGORIES.flatMap((c) => c.articles.map((a) => ({ cat: c, a, text: `${a.title} ${a.keywords} ${textOf(a.body)}`.toLowerCase() }))),
    [],
  );

  const q = query.trim().toLowerCase();
  const results = q ? index.filter((r) => q.split(/\s+/).every((w) => r.text.includes(w))) : null;
  const category = CATEGORIES.find((c) => c.id === activeCat) ?? CATEGORIES[0];
  const shown = results ? results.map((r) => ({ a: r.a, cat: r.cat })) : category.articles.map((a) => ({ a, cat: category }));

  const toggle = (id: string) =>
    setOpenIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const selectCat = (id: string) => {
    setActiveCat(id);
    setQuery("");
    setMobileCatsOpen(false);
    const first = CATEGORIES.find((c) => c.id === id)?.articles[0];
    if (first) setOpenIds(new Set([first.id]));
  };

  const runLink = (link: NonNullable<Article["link"]>) => {
    if (link.verify) onOpenVerify();
    else if (link.settings) openSettings(link.settings);
    else if (link.tab) onNavigate(link.tab);
  };

  const ActiveIcon = category.icon;

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <BookOpen className="size-5" aria-hidden /> Help Center
          </h2>
          <p className="text-xs text-[#8a8a8a] mt-1">Guides for verification, exam setup, AI proctoring and your privacy.</p>
        </div>
        <div className="relative w-full lg:w-96">
          <label htmlFor="docs-search" className="sr-only">Search help articles</label>
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-[#8a8a8a] pointer-events-none" aria-hidden />
          <input
            id="docs-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search e.g. calibration, tab switch, resume"
            className="w-full min-h-11 bg-white border border-[#dedede] rounded-xl pl-10 pr-10 text-base sm:text-[13px] placeholder:text-[#a2a2a2] text-[#1a1917] shadow-[0_4px_20px_rgba(128,128,128,0.04)] focus:outline-none focus:border-[#b2b2b2] focus:ring-1 focus:ring-[#b2b2b2]"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className={`absolute right-1 top-1/2 -translate-y-1/2 size-9 flex items-center justify-center rounded-lg text-[#8a8a8a] hover:text-[#1a1917] cursor-pointer ${focusRing}`}>
              <X className="size-4" aria-hidden />
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)] gap-5">
        {/* Category nav */}
        <nav aria-label="Help categories" className="lg:sticky lg:top-20 lg:self-start">
          <button
            type="button"
            onClick={() => setMobileCatsOpen((v) => !v)}
            aria-expanded={mobileCatsOpen}
            aria-controls="docs-cats"
            className={`lg:hidden w-full min-h-11 flex items-center justify-between gap-2 px-4 rounded-xl border border-[#dedede] bg-white text-sm font-semibold text-[#1a1917] cursor-pointer ${focusRing}`}
          >
            <span className="flex items-center gap-2">
              <ActiveIcon className="size-4 text-[#676767]" aria-hidden />
              {results ? "Search results" : category.label}
            </span>
            <ChevronDown className={`size-4 text-[#8a8a8a] transition-transform ${mobileCatsOpen ? "rotate-180" : ""}`} aria-hidden />
          </button>
          <ul
            id="docs-cats"
            className={`${mobileCatsOpen ? "block" : "hidden"} lg:block mt-2 lg:mt-0 bg-white border border-[#dedede] rounded-2xl p-2 shadow-[0_4px_20px_rgba(128,128,128,0.04)] space-y-0.5`}
          >
            {CATEGORIES.map((c) => {
              const Icon = c.icon;
              const active = !results && c.id === activeCat;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => selectCat(c.id)}
                    aria-current={active ? "page" : undefined}
                    className={`w-full min-h-11 flex items-center gap-3 px-3 rounded-xl text-[13px] text-left transition cursor-pointer ${focusRing} focus-visible:ring-offset-0 ${
                      active ? "bg-[#f6f6f6] text-[#1a1917] font-semibold" : "text-[#676767] hover:bg-[#f6f6f6] hover:text-[#1a1917]"
                    }`}
                  >
                    <Icon className={`size-4 shrink-0 ${active ? "text-[#1a1917]" : "text-[#8a8a8a]"}`} aria-hidden />
                    <span className="flex-1">{c.label}</span>
                    <span className="text-[11px] text-[#a2a2a2]">{c.articles.length}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Articles */}
        <section aria-live="polite" className="space-y-3 min-w-0">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#1a1917]">
              {results ? `${results.length} result${results.length === 1 ? "" : "s"} for "${query.trim()}"` : category.label}
            </h3>
          </div>

          {shown.length === 0 ? (
            <div className="bg-white border border-dashed border-[#dedede] rounded-2xl p-8 text-center">
              <p className="text-sm font-semibold text-[#1a1917]">No articles found</p>
              <p className="text-xs text-[#8a8a8a] mt-1">Try different words, or ask our support team directly.</p>
              <button
                type="button"
                onClick={() => onNavigate("Support")}
                className={`mt-4 min-h-11 px-5 rounded-xl bg-[#1a1917] text-white text-sm font-semibold hover:bg-black transition cursor-pointer ${focusRing}`}
              >
                Contact support
              </button>
            </div>
          ) : (
            shown.map(({ a, cat }) => {
              const open = results ? true : openIds.has(a.id);
              return (
                <article key={a.id} className="bg-white border border-[#dedede] rounded-2xl shadow-[0_4px_20px_rgba(128,128,128,0.04)] overflow-hidden">
                  <h4>
                    <button
                      type="button"
                      onClick={() => toggle(a.id)}
                      aria-expanded={open}
                      aria-controls={`doc-${a.id}`}
                      disabled={Boolean(results)}
                      className={`w-full min-h-14 flex items-center justify-between gap-3 px-5 py-3 text-left cursor-pointer disabled:cursor-default ${focusRing} focus-visible:ring-inset focus-visible:ring-offset-0`}
                    >
                      <span>
                        {results && <span className="block text-[10.5px] font-bold uppercase tracking-wider text-[#8a8a8a] mb-0.5">{cat.label}</span>}
                        <span className="text-sm font-semibold text-[#1a1917]">{a.title}</span>
                      </span>
                      {!results && <ChevronDown className={`size-4 shrink-0 text-[#8a8a8a] transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />}
                    </button>
                  </h4>
                  <AnimatePresence initial={false}>
                    {open && (
                      <motion.div
                        id={`doc-${a.id}`}
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        className="overflow-hidden"
                      >
                        <div className="px-5 pb-5 pt-1 space-y-3">
                          {a.body}
                          {a.link && (
                            <button
                              type="button"
                              onClick={() => runLink(a.link!)}
                              className={`inline-flex items-center gap-2 min-h-11 px-4 rounded-xl border border-[#dedede] bg-white text-xs font-semibold text-[#1a1917] hover:bg-[#f6f6f6] transition cursor-pointer ${focusRing}`}
                            >
                              {a.link.settings ? <Settings className="size-3.5" aria-hidden /> : null}
                              {a.link.label}
                            </button>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </article>
              );
            })
          )}

          <div className="mt-2 rounded-2xl bg-[#f6f6f6] border border-[#dedede]/70 p-5 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1">
              <p className="text-sm font-semibold text-[#1a1917]">Still need help?</p>
              <p className="text-xs text-[#676767] mt-0.5">Raise a ticket and our AI assistant and support team will get back to you.</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate("Support")}
              className={`min-h-11 px-5 rounded-xl bg-[#1a1917] text-white text-sm font-semibold hover:bg-black transition cursor-pointer ${focusRing}`}
            >
              Contact support
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
