import React, { useState, useEffect, useRef } from "react";
import { API_BASE_URL } from "../utils/api-client";
import {
  ShieldCheck,
  AlertTriangle,
  Clock,
  ChevronRight,
  ChevronLeft,
  Camera,
  Play,
  CheckCircle,
  HelpCircle,
  Loader2,
  ScanFace,
  Volume2,
  Activity,
  Sparkles,
  Eye,
  LayoutGrid,
  X,
  Wifi,
  WifiOff,
  ShieldAlert,
  BookOpen
} from "lucide-react";
import { toast } from "sonner";
import { canTakeExamOnThisDevice, EXAM_DEVICE_MESSAGE, getDeviceKind } from "../utils/device";
import { openPreferredCamera } from "../settings/preferences";
import { enterExamFullscreen, exitExamFullscreen, useExamMonitoring } from "../proctoring/use-exam-monitoring";
import { reportViolation } from "../proctoring/report-violation";
import VoiceBriefing from "../components/exam/VoiceBriefing";
import { PostExamFeedbackAgent } from "../components/PostExamFeedbackAgent";
import { QuestionAnswerInput, QuestionPrompt } from "../components/assessment/QuestionAnswerInput";
import { flushCodingDrafts } from "../components/code/workspace-api";
import { ExamMaterialsPanel } from "../components/assessment/ExamMaterialsPanel";
import { isAnswered as hasAnswer, parseJson } from "../components/assessment/question-meta";
import { LiveProctorMascot } from "../components/mascot/LiveProctorMascot";

async function readApiError(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    return body?.message || fallback;
  } catch {
    return fallback;
  }
}

interface StudentExamViewProps {
  assessmentId: string;
  user: any;
  onClose: () => void;
}

const SUBMISSION_STEPS = [
  "Uploading Answers...",
  "Saving Responses...",
  "Assessment Submitted Successfully",
  "Initializing AI Evaluation...",
  "Running Academic Integrity Analysis...",
  "Checking Similarity...",
  "Detecting AI-assisted Content...",
  "Calculating Integrity Score...",
  "Generating Report...",
  "Redirecting to Dashboard..."
];

// IndexedDB helpers for offline recovery
const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("integrity-offline-db", 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("offline-answers")) {
        db.createObjectStore("offline-answers", { keyPath: "questionId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const saveOfflineAnswer = async (questionId: string, response: string) => {
  try {
    const db = await openDB();
    const tx = db.transaction("offline-answers", "readwrite");
    const store = tx.objectStore("offline-answers");
    store.put({ questionId, response });
  } catch (err) {
    console.error("IndexedDB error:", err);
  }
};

const getOfflineAnswers = async (): Promise<{ questionId: string; response: string }[]> => {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("offline-answers", "readonly");
      const store = tx.objectStore("offline-answers");
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
};

const clearOfflineAnswers = async () => {
  try {
    const db = await openDB();
    const tx = db.transaction("offline-answers", "readwrite");
    const store = tx.objectStore("offline-answers");
    store.clear();
  } catch (err) {
    console.error("IndexedDB error:", err);
  }
};

export default function StudentExamView({ assessmentId, user, onClose }: StudentExamViewProps) {
  // Exams are laptop/desktop only (also enforced by the server).
  const [deviceBlocked] = useState(() => !canTakeExamOnThisDevice());
  const [assessment, setAssessment] = useState<any | null>(null);
  const [attempt, setAttempt] = useState<any | null>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);

  // Candidate answers state
  const [answers, setAnswers] = useState<Record<string, string>>({});
  
  // Immersive setup states
  const [examStarted, setExamStarted] = useState(false);
  const [systemChecked, setSystemChecked] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const miniVideoRef = useRef<HTMLVideoElement | null>(null);

  // Proctoring Onboarding Verification States
  const [showPhotoCapture, setShowPhotoCapture] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [faceAligned, setFaceAligned] = useState(false);
  const [detectionProgress, setDetectionProgress] = useState(0);
  const [isAutoCapturing, setIsAutoCapturing] = useState(false);
  const [scanHint, setScanHint] = useState<string | null>(null);
  const captureVideoRef = useRef<HTMLVideoElement | null>(null);

  // 3-Second Camera Posture Calibration States
  const [showCalibration, setShowCalibration] = useState(false);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [calibrationCountdown, setCalibrationCountdown] = useState(3);
  const [isCalibrated, setIsCalibrated] = useState(false);
  const calibrationVideoRef = useRef<HTMLVideoElement | null>(null);

  const [isExamSuspended, setIsExamSuspended] = useState(false);
  const [suspensionMessage, setSuspensionMessage] = useState("");
  const [recentProctorAlerts, setRecentProctorAlerts] = useState<string[]>([]);
  
  // Timer state
  const [timeLeft, setTimeLeft] = useState(0); // seconds
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAnimation, setShowAnimation] = useState(false);
  const [currentStepIdx, setCurrentStepIdx] = useState(0);

  // Telemetry and recovery states
  const [faceStatus, setFaceStatus] = useState<string>("Detected");
  const [warningsCount, setWarningsCount] = useState(0);
  const [integrityScore, setIntegrityScore] = useState(100);
  const [markedQuestions, setMarkedQuestions] = useState<string[]>([]);
  const [visitedQuestions, setVisitedQuestions] = useState<string[]>([]);
  const [showLookAwayAlert, setShowLookAwayAlert] = useState(false);
  const [showFaceMissingAlert, setShowFaceMissingAlert] = useState(false);
  const [examFinished, setExamFinished] = useState(false);
  const [showFeedbackAgent, setShowFeedbackAgent] = useState(false);
  const [showResumeModal, setShowResumeModal] = useState(false);

  // Session lifecycle + agent health (server is the source of truth)
  const [calibrationError, setCalibrationError] = useState<string | null>(null);
  const [isStartingSession, setIsStartingSession] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [showBriefing, setShowBriefing] = useState(false);

  // Initial load can stall on a very slow connection: offer a way out.
  const [loadSlow, setLoadSlow] = useState(false);
  const initAbortRef = useRef<AbortController | null>(null);

  // Fetch assessment and start/resume attempt
  const initializeExam = async () => {
    const ctrl = new AbortController();
    initAbortRef.current = ctrl;
    try {
      const res = await fetch(`/api/assessments/${assessmentId}`, {
        headers: { "x-user-id": user.id, "x-user-role": "user" },
        signal: ctrl.signal,
      });
      if (res.ok) {
        const data = await res.json();
        setAssessment(data.data);
        
        // Start or resume attempt (body sends resumeReason if we know it, default "disconnect" for recovery)
        const attemptRes = await fetch(`/api/assessments/${assessmentId}/start`, {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "x-user-id": user.id, 
            "x-user-role": "user" 
          },
          body: JSON.stringify({ resumeReason: "disconnect" }),
          signal: ctrl.signal,
        });
        
        if (attemptRes.ok) {
          const attemptData = await attemptRes.json();
          const attemptObj = attemptData.data.attempt;
          setAttempt(attemptObj);
          setQuestions(attemptData.data.questions || []);
          
          // Restore answers: server copy, then anything saved on this device
          // while the connection was down (e.g. before "Exit & resume later").
          const initialAnswers: Record<string, string> = {};
          (attemptObj.answers || []).forEach((ans: any) => {
            initialAnswers[ans.questionId] = ans.response;
          });
          const questionIds = new Set((attemptData.data.questions || []).map((q: any) => q.id));
          const localAnswers = (await getOfflineAnswers()).filter((a) => questionIds.has(a.questionId));
          localAnswers.forEach((a) => {
            initialAnswers[a.questionId] = a.response;
          });
          if (Object.keys(initialAnswers).length > 0) setAnswers(initialAnswers);

          // Restore question index
          if (attemptObj.currentQuestionIndex !== undefined) {
            setActiveIdx(attemptObj.currentQuestionIndex);
          }

          // Restore timer
          if (attemptObj.timeLeft !== null && attemptObj.timeLeft !== undefined) {
            setTimeLeft(attemptObj.timeLeft);
          } else {
            setTimeLeft(data.data.duration * 60);
          }

          // Restore marked questions
          if (attemptObj.markedQuestions) {
            try {
              setMarkedQuestions(JSON.parse(attemptObj.markedQuestions));
            } catch (e) {
              setMarkedQuestions([]);
            }
          }

          // Restore visited questions
          if (attemptObj.visitedQuestions) {
            try {
              setVisitedQuestions(JSON.parse(attemptObj.visitedQuestions));
            } catch (e) {
              setVisitedQuestions([]);
            }
          }

          // Restore integrity status
          if (attemptObj.integrityScore !== undefined) {
            setIntegrityScore(attemptObj.integrityScore);
          }

          // If resume count is greater than 0, show the resume overlay modal
          if (attemptObj.resumeCount > 0) {
            setShowResumeModal(true);
          }
        } else {
          const errData = await attemptRes.json();
          toast.error(errData.message || "Failed to start exam.");
          onClose();
        }
      }
    } catch (e) {
      if (ctrl.signal.aborted) return; // candidate chose to exit
      toast.error("An error occurred during system checks.");
      onClose();
    }
  };

  useEffect(() => {
    if (assessment && attempt) {
      setLoadSlow(false);
      return;
    }
    const t = setTimeout(() => setLoadSlow(true), 15000);
    return () => clearTimeout(t);
  }, [assessment, attempt]);

  useEffect(() => () => initAbortRef.current?.abort(), []);

  useEffect(() => {
    if (deviceBlocked) return;
    initializeExam();
  }, [assessmentId, deviceBlocked]);

  // Request webcam stream during setup phase
  const startCameraSetup = async () => {
    try {
      const stream = await openPreferredCamera(user.id);
      setCameraStream(stream);
      setSystemChecked(true);
      toast.success("Webcam verified. Ready to start secure session.");
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      toast.error("Webcam access is REQUIRED to launch this assessment.");
    }
  };

  // Stop camera stream when leaving
  useEffect(() => {
    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [cameraStream]);

  // Connect webcam to video tag once exam starts
  useEffect(() => {
    if (examStarted && videoRef.current && cameraStream) {
      videoRef.current.srcObject = cameraStream;
    }
  }, [examStarted, cameraStream]);

  // Connect webcam to verification capture video tag
  useEffect(() => {
    if (showPhotoCapture && captureVideoRef.current && cameraStream) {
      captureVideoRef.current.srcObject = cameraStream;
    }
  }, [showPhotoCapture, cameraStream]);

  // Grab a downscaled JPEG from the onboarding camera (keeps aspect ratio).
  // Smaller frames upload and analyse much faster on the server.
  const grabOnboardingFrame = (maxWidth = 480, quality = 0.8): string | null => {
    const video = captureVideoRef.current;
    if (!video || video.readyState < 2 || video.videoWidth === 0) return null;
    const scale = Math.min(1, maxWidth / video.videoWidth);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", quality);
  };

  const requestFaceCheck = async (
    dataUrl: string,
    signal?: AbortSignal,
  ): Promise<{ ok: boolean; message?: string }> => {
    const res = await fetch("/api/proctoring/face-check", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": user.id,
        "x-user-role": "user",
      },
      body: JSON.stringify({ selfie: dataUrl }),
      signal,
    });
    const resData = await res.json().catch(() => null);
    if (res.ok && resData?.success && resData.data?.faceDetected && !resData.data?.multipleFaces) {
      return { ok: true };
    }
    return { ok: false, message: resData?.data?.message || resData?.message };
  };

  // Automated face detection: keeps sending frames until a single face is found.
  useEffect(() => {
    if (!showPhotoCapture || capturedPhoto) return;

    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let tickTimer: ReturnType<typeof setInterval> | undefined;
    const controller = new AbortController();
    let shownError = false;

    setDetectionProgress(0);
    setFaceAligned(false);
    setScanHint(null);
    setIsAutoCapturing(true);

    const attempt = async () => {
      if (cancelled) return;
      const dataUrl = grabOnboardingFrame();
      if (!dataUrl) {
        // Camera not producing frames yet; check again shortly.
        retryTimer = setTimeout(attempt, 150);
        return;
      }

      // Ease the bar towards 90% while the server analyses the frame.
      setDetectionProgress((p) => Math.max(p, 15));
      tickTimer = setInterval(() => setDetectionProgress((p) => (p < 90 ? p + 8 : p)), 80);

      try {
        const result = await requestFaceCheck(dataUrl, controller.signal);
        if (cancelled) return;
        clearInterval(tickTimer);
        if (result.ok) {
          setDetectionProgress(100);
          setFaceAligned(true);
          setScanHint(null);
          setCapturedPhoto(dataUrl);
          toast.success("AI Proctor: Face detected and aligned! Onboarding photo verified.");
          return;
        }
        setDetectionProgress(10);
        setScanHint(result.message || "No face detected. Look at the camera inside the circle.");
      } catch (err) {
        if (cancelled || (err as Error)?.name === "AbortError") return;
        clearInterval(tickTimer);
        setDetectionProgress(10);
        setScanHint("Can't reach the face check service. Retrying...");
        if (!shownError) {
          shownError = true;
          toast.error("AI Proctor: Connection error. Retrying...");
        }
      }
      retryTimer = setTimeout(attempt, 400);
    };

    attempt();

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(retryTimer);
      clearInterval(tickTimer);
      setIsAutoCapturing(false);
    };
  }, [showPhotoCapture, capturedPhoto]);

  const handleManualCapture = async () => {
    const dataUrl = grabOnboardingFrame();
    if (!dataUrl) {
      toast.error("Camera isn't ready yet. Please wait a moment.");
      return;
    }
    try {
      const result = await requestFaceCheck(dataUrl);
      if (result.ok) {
        setCapturedPhoto(dataUrl);
        setFaceAligned(true);
        setDetectionProgress(100);
        setScanHint(null);
        toast.success("Manual photo capture verified.");
      } else {
        toast.error(result.message || "Manual photo capture verification failed: No face detected.");
      }
    } catch {
      toast.error("Error contacting face check service.");
    }
  };

  const handleRetakePhoto = () => {
    setCapturedPhoto(null);
    setFaceAligned(false);
    setDetectionProgress(0);
  };

  // Connect webcam to calibration video tag
  useEffect(() => {
    if (showCalibration && calibrationVideoRef.current && cameraStream) {
      calibrationVideoRef.current.srcObject = cameraStream;
    }
  }, [showCalibration, cameraStream]);

  // Capture a JPEG from whichever live video element is currently rendering.
  const captureFrame = (width = 480, height = 360, quality = 0.72): string | null => {
    const candidates = [videoRef.current, miniVideoRef.current, calibrationVideoRef.current, captureVideoRef.current];
    const videoEl = candidates.find((v) => v && v.videoWidth > 0 && v.readyState >= 2);
    if (!videoEl) return null;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(videoEl, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", quality);
  };

  // Client-side monitoring agents (fullscreen, focus, keyboard, network,
  // audio, vision stream, faculty channel). See ../proctoring/.
  const browserRules = React.useMemo(() => {
    if (!assessment?.integrityConfig) return undefined;
    const cfg = parseJson<any>(assessment.integrityConfig, {});
    const b = cfg.browser ?? {};
    const tabsOn = assessment.tabSwitchDetection !== false;
    return {
      tabSwitch: tabsOn && b.tabSwitch !== false,
      windowFocus: tabsOn && b.windowFocus !== false,
      fullscreenExit: b.fullscreenExit !== false,
      copyPaste: Boolean(assessment.browserLockdown) && b.copyPaste !== false,
      contextMenu: Boolean(assessment.browserLockdown) && b.contextMenu !== false,
      micDisconnect: cfg.microphone?.micDisconnect !== false,
    };
  }, [assessment?.integrityConfig, assessment?.tabSwitchDetection, assessment?.browserLockdown]);

  const [showMaterials, setShowMaterials] = useState(false);

  const monitoring = useExamMonitoring({
    examActive: examStarted && !examFinished,
    examStarted,
    attemptId: attempt?.id ?? null,
    userId: user.id,
    cameraStream,
    browserLockdown: Boolean(assessment?.browserLockdown),
    microphoneAnalysis: Boolean(assessment?.microphoneAnalysis),
    browserRules,
    captureFrame: () => captureFrame(480, 360, 0.7),
    captureLiveFrame: (focused) => (focused ? captureFrame(480, 360, 0.6) : captureFrame(320, 240, 0.5)),
    handlers: {
      onIntegrityScore: setIntegrityScore,
      onWarningCount: setWarningsCount,
      onFaceStatus: setFaceStatus,
      onSuspend: (message, ended) => {
        setIsExamSuspended(true);
        setSuspensionMessage(message);
        if (ended) setExamFinished(true);
      },
      onPause: (message) => {
        setIsExamSuspended(true);
        setSuspensionMessage(message);
      },
      onResume: () => {
        setIsExamSuspended(false);
        setSuspensionMessage("");
      },
      onTerminate: (message) => {
        setIsExamSuspended(true);
        setSuspensionMessage(message);
        setExamFinished(true);
      },
      onNotice: (message) => setRecentProctorAlerts((prev) => [message, ...prev].slice(0, 5)),
      onPenalty: (points) => {
        setWarningsCount((w) => w + 1);
        setIntegrityScore((sc) => Math.max(0, sc - points));
      },
      onReconnect: async () => {
        const offlineAnswers = await getOfflineAnswers();
        if (offlineAnswers.length === 0) return false;
        const updatedAnswers = { ...answers };
        offlineAnswers.forEach((ans) => {
          updatedAnswers[ans.questionId] = ans.response;
        });
        setAnswers(updatedAnswers);
        await saveStateToServer(updatedAnswers);
        await clearOfflineAnswers();
        toast.success("✔ Answers Synced Successfully");
        return true;
      },
    },
  });
  const { fullscreen, clientAgents, recording, device } = monitoring;

  // Camera reconnect after a disconnect (the recording/vision agents pick up the new stream).
  const [isReconnectingCamera, setIsReconnectingCamera] = useState(false);
  const reconnectCamera = async () => {
    setIsReconnectingCamera(true);
    try {
      const stream = await openPreferredCamera(user.id);
      setCameraStream(stream);
      toast.success("Camera reconnected.");
    } catch {
      toast.error("Could not access the camera. Check the connection and browser permission.");
    } finally {
      setIsReconnectingCamera(false);
    }
  };
  const networkStatus = monitoring.network.status;
  const latency = monitoring.network.latency;
  const showSlowNetworkAlert = monitoring.network.showSlowAlert;
  const tabSwitches = monitoring.focus.tabSwitches;
  const backgroundNoise = monitoring.audio.noise;
  const showNoiseAlert = monitoring.audio.showAlert;
  const proctorMetrics = monitoring.vision.metrics;
  const cameraQuality = monitoring.vision.cameraQuality;
  const agentHealth = monitoring.vision.agentHealth;
  const currentPose = monitoring.vision.pose;
  const monitoringLinkOk = monitoring.vision.linkOk;
  /** Connection too slow to run the exam: content hidden, timer frozen. */
  const networkHold = examStarted && !examFinished && monitoring.network.critical;

  // Execute 3-Second Camera Posture Baseline Calibration.
  // Success is only shown when the server confirms a usable baseline.
  const runCalibration = async () => {
    if (!attempt) return;
    setCalibrationError(null);
    setIsCalibrating(true);
    setIsCalibrated(false);
    setCalibrationCountdown(3);

    for (let count = 2; count >= 0; count--) {
      await new Promise((r) => setTimeout(r, 1000));
      setCalibrationCountdown(Math.max(count, 0));
    }

    const frame = captureFrame();
    if (!frame) {
      setIsCalibrating(false);
      setCalibrationError("Camera feed is not ready. Make sure your webcam is on and try again.");
      return;
    }

    try {
      const res = await fetch("/api/ai-proctoring/calibrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attemptId: attempt.id, frame }),
      });
      if (!res.ok) {
        const msg = await readApiError(res, "Calibration failed. Please try again.");
        setCalibrationError(msg);
        toast.error(msg);
        return;
      }
      const payload = await res.json();
      setIsCalibrated(true);
      if (payload?.data?.identityEnrolled === false) {
        toast.warning("Calibrated, but your face could not be enrolled for identity checks. Faculty will be notified.");
      } else {
        toast.success("Camera posture baseline calibrated successfully.");
      }
    } catch {
      const msg = "Could not reach the proctoring server. Check your connection and retry.";
      setCalibrationError(msg);
      toast.error(msg);
    } finally {
      setIsCalibrating(false);
    }
  };

  /**
   * Starts (or resumes) the server-side proctoring session. The exam only
   * launches when the server confirms the session; failures keep the
   * candidate on the onboarding screen.
   */
  const startProctoringSession = async (): Promise<{ ok: boolean; calibrated?: boolean; status?: string }> => {
    if (!attempt) return { ok: false };
    try {
      const res = await fetch("/api/ai-proctoring/start-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attemptId: attempt.id }),
      });
      if (!res.ok) {
        toast.error(await readApiError(res, "Could not start the proctoring session."));
        return { ok: false };
      }
      const payload = await res.json();
      const data = payload?.data || {};
      if (typeof data.warningCount === "number") setWarningsCount(data.warningCount);
      if (data.status === "PAUSED") {
        setIsExamSuspended(true);
        setSuspensionMessage("Your examination is paused pending faculty review.");
      }
      return { ok: true, calibrated: Boolean(data.calibrated), status: data.status };
    } catch {
      toast.error("Could not reach the proctoring server. Check your connection and retry.");
      return { ok: false };
    }
  };

  const finalizeOnboardingAndStartExam = async () => {
    if (!attempt || isStartingSession) return;
    if (!isCalibrated) {
      toast.error("Complete camera calibration before starting the exam.");
      return;
    }
    // Request full screen synchronously inside the click gesture.
    const fullscreenRequest = enterExamFullscreen();
    setIsStartingSession(true);
    const result = await startProctoringSession();
    setIsStartingSession(false);
    if (result.ok && !(await fullscreenRequest)) {
      toast.warning("Full screen could not be enabled automatically. You'll be asked to enter it to continue.");
    }
    if (!result.ok) return;
    setShowCalibration(false);
    setShowPhotoCapture(false);
    // First start: 20-second spoken briefing, then the exam (and timer) begins.
    if ((attempt.resumeCount ?? 0) === 0) setShowBriefing(true);
    else setExamStarted(true);
  };

  // Resuming must re-establish the camera and the server session; it never
  // drops the candidate into an unmonitored exam.
  const resumeProctoredSession = async () => {
    if (isStartingSession) return;
    void enterExamFullscreen(); // inside the click gesture
    setIsStartingSession(true);
    try {
      let stream = cameraStream;
      if (!stream) {
        try {
          stream = await openPreferredCamera(user.id);
          setCameraStream(stream);
          setSystemChecked(true);
        } catch {
          toast.error("Webcam access is required to resume this assessment.");
          return;
        }
      }
      const result = await startProctoringSession();
      if (!result.ok) return;
      setShowResumeModal(false);
      if (result.calibrated) {
        setIsCalibrated(true);
        setExamStarted(true);
      } else {
        setShowCalibration(true);
      }
    } finally {
      setIsStartingSession(false);
    }
  };

  // Timer countdown hook
  useEffect(() => {
    if (!examStarted || timeLeft <= 0 || examFinished || networkHold) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          if (assessment?.autoSubmitOnExpiry === false) {
            toast.warning("Time is up. Answers are now locked — review and submit your examination.");
          } else {
            handleAutoSubmit();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [examStarted, timeLeft, examFinished, networkHold]);

  // Log each network hold with its duration (the timer was frozen meanwhile).
  const holdStartedAtRef = useRef<number | null>(null);
  useEffect(() => {
    if (!attempt) return;
    if (networkHold) {
      holdStartedAtRef.current = Date.now();
      return;
    }
    const startedAt = holdStartedAtRef.current;
    if (startedAt === null) return;
    holdStartedAtRef.current = null;
    const secs = Math.round((Date.now() - startedAt) / 1000);
    toast.success("Connection restored. Your exam has resumed.");
    void reportViolation(
      attempt.id,
      user.id,
      "network-hold",
      "low",
      `Exam paused for ${secs}s because the connection was too slow; timer was frozen.`,
    );
  }, [networkHold, attempt, user.id]);

  // "Exit & resume later": save what we can, then leave. The remaining time is
  // the frozen timer value, restored when the candidate resumes.
  const [isExitingForNetwork, setIsExitingForNetwork] = useState(false);
  const exitAndResumeLater = async () => {
    if (isExitingForNetwork) return;
    setIsExitingForNetwork(true);
    initAbortRef.current?.abort();
    for (const [qId, response] of Object.entries(answers)) await saveOfflineAnswer(qId, response);
    if (attempt) {
      const withTimeout = (p: Promise<unknown>, ms: number) =>
        Promise.race([p, new Promise((r) => setTimeout(r, ms))]);
      await withTimeout(
        Promise.allSettled([
          saveStateToServer(),
          reportViolation(
            attempt.id,
            user.id,
            "network-exit",
            "medium",
            `Candidate exited because the connection was too slow; ${Math.floor(timeLeft / 60)}m ${timeLeft % 60}s remaining.`,
          ),
        ]),
        6000,
      );
    }
    cameraStream?.getTracks().forEach((t) => t.stop());
    await exitExamFullscreen();
    toast.info("Exam paused. Open it again from your dashboard to resume where you left off.");
    onClose();
  };

  const saveStateToServer = async (
    customAnswers?: Record<string, string>, 
    customIdx?: number, 
    customTimeLeft?: number,
    customMarked?: string[],
    customVisited?: string[]
  ) => {
    if (!attempt) return;
    
    const answersPayload = Object.entries(customAnswers || answers).map(([questionId, response]) => ({
      questionId,
      response
    }));

    const payload = {
      answers: answersPayload,
      currentQuestionIndex: customIdx !== undefined ? customIdx : activeIdx,
      timeLeft: customTimeLeft !== undefined ? customTimeLeft : timeLeft,
      markedQuestions: customMarked || markedQuestions,
      visitedQuestions: customVisited || visitedQuestions,
      progress: questions.length > 0 ? Math.round((Object.values(customAnswers || answers).filter((v) => hasAnswer(v)).length / questions.length) * 100) : 0,
      integrityScore: integrityScore,
      networkQuality: networkStatus,
      networkLatency: latency,
      faceStatus: faceStatus,
      backgroundNoise: backgroundNoise,
      isOnline: networkStatus !== "Offline"
    };

    if (networkStatus === "Offline" || !navigator.onLine) {
      // Save offline in IndexedDB
      for (const [qId, response] of Object.entries(customAnswers || answers)) {
        await saveOfflineAnswer(qId, response);
      }
      return;
    }

    try {
      await fetch(`/api/assessments/attempts/${attempt.id}/save-state`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": user.id,
          "x-user-role": "user"
        },
        body: JSON.stringify(payload)
      });
    } catch (err) {
      console.error("Failed to save state to server:", err);
      for (const [qId, response] of Object.entries(customAnswers || answers)) {
        await saveOfflineAnswer(qId, response);
      }
    }
  };

  // Auto-Save interval every 5 seconds
  useEffect(() => {
    if (!examStarted || !attempt || examFinished) return;
    const interval = setInterval(() => {
      saveStateToServer();
    }, 5000);
    return () => clearInterval(interval);
  }, [examStarted, attempt, answers, activeIdx, timeLeft, markedQuestions, visitedQuestions, integrityScore, networkStatus, latency, faceStatus, backgroundNoise, examFinished]);

  // Before browser unload handler
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      saveStateToServer();
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [answers, activeIdx, timeLeft, markedQuestions, visitedQuestions]);

  // Attach the stream to the floating mobile/tablet self-view
  useEffect(() => {
    if (examStarted && miniVideoRef.current && cameraStream) {
      miniVideoRef.current.srcObject = cameraStream;
    }
  }, [examStarted, cameraStream]);

  // Report progress changes to backend
  const updateProgressPercent = async (updatedAnswers: Record<string, string>) => {
    if (!attempt || questions.length === 0) return;
    const answeredCount = Object.values(updatedAnswers).filter((v) => hasAnswer(v)).length;
    const pct = Math.round((answeredCount / questions.length) * 100);
    
    try {
      await fetch(`/api/assessments/attempts/${attempt.id}/progress`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": user.id,
          "x-user-role": "user"
        },
        body: JSON.stringify({ progress: pct })
      });
    } catch {
      // ignore
    }
  };

  const handleSelectOption = (qId: string, opt: string) => {
    const nextAnswers = { ...answers, [qId]: opt };
    setAnswers(nextAnswers);
    updateProgressPercent(nextAnswers);
    saveStateToServer(nextAnswers);
  };

  const handleTextChange = (qId: string, text: string) => {
    const nextAnswers = { ...answers, [qId]: text };
    setAnswers(nextAnswers);
    updateProgressPercent(nextAnswers);
    saveStateToServer(nextAnswers);
  };

  const handleNavigateQuestion = (newIdx: number) => {
    setActiveIdx(newIdx);
    const qId = questions[newIdx]?.id;
    if (qId && !visitedQuestions.includes(qId)) {
      const nextVisited = [...visitedQuestions, qId];
      setVisitedQuestions(nextVisited);
      saveStateToServer(answers, newIdx, timeLeft, markedQuestions, nextVisited);
    } else {
      saveStateToServer(answers, newIdx, timeLeft, markedQuestions, visitedQuestions);
    }
  };

  const handleAutoSubmit = () => {
    toast.info("Time limit reached. Auto-submitting assessment responses...");
    handleSubmit();
  };

  // Advance the submission progress steps once per second.
  // Depends ONLY on showAnimation: the parent re-renders every second (live
  // clock) and passes a fresh onClose each time, so listing onClose here reset
  // the interval before it ever fired and froze the modal at step 1 (10%).
  useEffect(() => {
    if (!showAnimation) return;
    const interval = setInterval(() => {
      setCurrentStepIdx((prev) => Math.min(prev + 1, SUBMISSION_STEPS.length - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [showAnimation]);

  // After the last step, hand over to the post-exam feedback agent.
  useEffect(() => {
    if (!showAnimation || currentStepIdx < SUBMISSION_STEPS.length - 1) return;
    const done = setTimeout(() => {
      setShowAnimation(false);
      setShowFeedbackAgent(true);
    }, 1000);
    return () => clearTimeout(done);
  }, [showAnimation, currentStepIdx]);

  const handleSubmit = async () => {
    if (isSubmitting || !attempt) return;
    setIsSubmitting(true);
    // Push any unsaved coding drafts first: the backend grades the newest saved code.
    await flushCodingDrafts();

    try {
      const answersPayload = Object.entries(answers).map(([questionId, response]) => ({
        questionId,
        response
      }));

      const res = await fetch(`/api/assessments/attempts/${attempt.id}/submit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": user.id,
          "x-user-role": "user"
        },
        body: JSON.stringify({ answers: answersPayload })
      });

      if (res.ok) {
        // Trigger multi-agent post-exam proctoring evaluation & Ollama summary
        fetch("/api/ai-proctoring/end-session", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-user-id": user.id,
            "x-user-role": "user",
          },
          body: JSON.stringify({ attemptId: attempt.id }),
        }).catch((e) => console.warn("Failed to end proctoring session:", e));

        // Stop webcam
        if (cameraStream) {
          cameraStream.getTracks().forEach((track) => track.stop());
        }
        setExamFinished(true);
        setShowAnimation(true);
      } else {
        toast.error("Failed to submit.");
        setIsSubmitting(false);
      }
    } catch {
      toast.error("Submission failed.");
      setIsSubmitting(false);
    }
  };

  // Formatting remaining time
  const formatTime = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${h > 0 ? h + ":" : ""}${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  if (deviceBlocked) {
    const kind = getDeviceKind();
    return (
      <div className="min-h-[100dvh] bg-[#1a1917] text-[#fffcf7] flex items-center justify-center p-5">
        <div className="w-full max-w-md rounded-3xl border border-zinc-800 bg-[#242220] p-6 sm:p-8 text-center space-y-4 shadow-2xl">
          <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-[#c5af8a]/10 text-[#c5af8a]">
            <Camera className="size-8" aria-hidden="true" />
          </div>
          <h1 className="text-xl font-bold">Use a laptop or desktop for this exam</h1>
          <p className="text-sm text-zinc-300 leading-relaxed">
            {kind === "tablet" ? "Tablets" : "Phones"} aren't supported for proctored assessments. {EXAM_DEVICE_MESSAGE}
          </p>
          <ul className="text-left text-[13px] text-zinc-400 space-y-1.5 rounded-2xl bg-zinc-900/60 border border-zinc-800 p-4">
            <li>• A laptop or desktop with a working webcam</li>
            <li>• Chrome, Edge or Firefox, kept in full screen</li>
            <li>• A quiet, well-lit room</li>
          </ul>
          <button
            type="button"
            onClick={onClose}
            className="w-full min-h-12 rounded-xl bg-[#c5af8a] text-zinc-950 text-sm font-bold hover:bg-[#b09b77] cursor-pointer"
          >
            Back to dashboard
          </button>
        </div>
      </div>
    );
  }

  if (!assessment || !attempt) {
    return (
      <div className="min-h-screen bg-[#ffffff] flex items-center justify-center p-6">
        <div className="text-center space-y-3 max-w-sm">
          <div className="animate-spin size-8 border-4 border-[#b2b2b2] border-t-transparent rounded-full mx-auto" />
          <p className="text-sm font-bold text-[#8a8a8a]">Initializing assessment shields...</p>
          {loadSlow && (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-left space-y-3">
              <div className="flex items-start gap-2">
                <WifiOff className="size-4 text-amber-700 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-amber-900">Your connection is too slow to load the exam</p>
                  <p className="text-xs text-amber-800 mt-1">
                    Your timer has not started. You can keep waiting, or exit now and resume later from your
                    dashboard with your full remaining time.
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={isExitingForNetwork}
                onClick={() => void exitAndResumeLater()}
                className="w-full min-h-10 rounded-xl bg-[#1a1917] text-white text-xs font-bold cursor-pointer disabled:opacity-60"
              >
                Exit &amp; resume later
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] w-full bg-[#1a1917] text-[#fcfcfc] flex flex-col font-sans select-none overflow-hidden relative">
      <style>{`
        @keyframes scan {
          0% { top: 0%; }
          50% { top: 100%; }
          100% { top: 0%; }
        }
      `}</style>
      {/* 1. SETUP / CAMERA CHECK PHASE OR ONBOARDING PHOTO CAPTURE */}
      {!examStarted ? (
        showPhotoCapture ? (
          /* ONBOARDING PHOTO CAPTURE VIEW */
          <div className="flex-1 min-h-0 overflow-y-auto flex flex-col p-3 sm:p-4">
            <div className="max-w-[500px] w-full mx-auto my-auto rounded-3xl bg-[#222222] border border-zinc-800 p-5 sm:p-8 space-y-5 sm:space-y-6 shadow-2xl relative overflow-hidden">
              <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-[#b2b2b2]/40 to-transparent" />
              
              <div className="text-center space-y-2">
                <span className="text-[10px] font-bold text-[#b2b2b2] uppercase tracking-wider block">Step 2: Proctoring Onboarding</span>
                <h2 className="text-xl font-bold text-white">Facial Biometric Verification</h2>
                <p className="text-xs text-zinc-400">Position your face within the guide box to align and capture.</p>
              </div>

              {/* Guide box and video feed */}
              <div className="aspect-video bg-zinc-950 rounded-2xl border border-zinc-800 relative flex items-center justify-center overflow-hidden">
                {capturedPhoto ? (
                  <img src={capturedPhoto} className="absolute inset-0 w-full h-full object-cover" alt="Captured Candidate" />
                ) : (
                  <>
                    <video ref={captureVideoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover opacity-80" />
                    
                    {/* Frame overlay */}
                    <div className={`absolute size-[120px] sm:size-[160px] rounded-full border-2 border-dashed transition-all duration-300 ${faceAligned ? "border-emerald-500 bg-emerald-500/5 shadow-[0_0_20px_rgba(16,185,129,0.3)]" : "border-[#b2b2b2]/60 animate-pulse"}`}>
                      {/* Scanning vertical line */}
                      {!faceAligned && (
                        <div className="w-full h-0.5 bg-[#b2b2b2] shadow-[0_0_8px_#b2b2b2] absolute top-0 animate-[scan_2s_infinite_ease-in-out]" />
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Progress and status */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs text-zinc-300">
                  <span className="font-semibold">
                    {capturedPhoto 
                      ? "✓ Photo Verified" 
                      : faceAligned 
                      ? "✓ Face Aligned" 
                      : scanHint ?? "Scanning for face alignment..."}
                  </span>
                  {!capturedPhoto && (
                    <span className="font-mono text-[10px] text-zinc-450">{detectionProgress}%</span>
                  )}
                </div>
                {!capturedPhoto && (
                  <div className="h-1.5 w-full bg-zinc-900 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-[#b2b2b2] to-emerald-500 transition-all duration-200" 
                      style={{ width: `${detectionProgress}%` }}
                    />
                  </div>
                )}
              </div>

              {/* Capture Control Button panel */}
              <div className="flex flex-col gap-3">
                <div className="flex gap-3">
                  {capturedPhoto ? (
                    <button
                      type="button"
                      onClick={handleRetakePhoto}
                      className="flex-1 py-3 border border-zinc-800 hover:bg-zinc-800 rounded-xl text-xs font-bold transition cursor-pointer text-white"
                    >
                      Retake Photo
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleManualCapture}
                      className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white py-3 rounded-xl text-xs font-bold transition cursor-pointer"
                    >
                      Take Photo
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={!capturedPhoto}
                    onClick={() => {
                      setShowPhotoCapture(false);
                      setShowCalibration(true);
                    }}
                    className="flex-1 bg-[#b2b2b2] hover:bg-[#9e9e9e] disabled:opacity-40 disabled:hover:bg-[#b2b2b2] text-zinc-950 py-3 rounded-xl text-xs font-bold transition cursor-pointer shadow-md"
                  >
                    Proceed to Calibration
                  </button>
                </div>
                
                <button
                  type="button"
                  onClick={() => setShowPhotoCapture(false)}
                  className="w-full py-2.5 text-zinc-500 hover:text-zinc-300 text-[11px] font-bold bg-transparent border-none cursor-pointer"
                >
                  Cancel
                </button>
              </div>

            </div>
          </div>
        ) : showCalibration ? (
          /* STEP 3: 3-SECOND CAMERA & POSTURE CALIBRATION VIEW */
          <div className="flex-1 min-h-0 overflow-y-auto flex flex-col p-3 sm:p-4">
            <div className="max-w-[540px] w-full mx-auto my-auto rounded-3xl bg-[#222222] border border-zinc-800 p-5 sm:p-8 space-y-5 sm:space-y-6 shadow-2xl relative overflow-hidden">
              <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-[#b2b2b2]/60 to-transparent" />

              <div className="text-center space-y-2">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#b2b2b2]/10 border border-[#b2b2b2]/20 text-[#b2b2b2] text-[10px] font-extrabold uppercase tracking-wider">
                  <Sparkles className="size-3" /> Step 3: Camera Calibration
                </div>
                <h2 className="text-xl font-bold text-white">Baseline Posture Calibration</h2>
                <p className="text-xs text-zinc-400 max-w-sm mx-auto">
                  Look naturally at the center of your screen for 3 seconds to establish your baseline head pose &amp; camera angle.
                </p>
              </div>

              {/* Video with target crosshair / reticle */}
              <div className="aspect-video bg-zinc-950 rounded-2xl border border-zinc-800 relative flex items-center justify-center overflow-hidden shadow-inner">
                <video
                  ref={calibrationVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="absolute inset-0 w-full h-full object-cover opacity-85"
                />

                {/* Reticle guide overlay */}
                <div className="absolute size-32 sm:size-44 rounded-full border-2 border-dashed border-[#b2b2b2]/60 flex items-center justify-center pointer-events-none">
                  <div className="size-24 rounded-full border border-[#b2b2b2]/40" />
                  <div className={`size-2.5 rounded-full ${isCalibrated ? "bg-emerald-400 shadow-[0_0_12px_#10b981]" : "bg-[#b2b2b2] animate-ping"}`} />
                </div>

                {/* Live countdown overlay while calibrating */}
                {isCalibrating && (
                  <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center gap-2">
                    <span className="text-5xl font-extrabold text-[#b2b2b2] font-mono tracking-wider animate-pulse">
                      {calibrationCountdown}s
                    </span>
                    <span className="text-xs font-bold text-white bg-black/40 px-3 py-1 rounded-full">
                      Hold still... measuring baseline yaw &amp; pitch
                    </span>
                  </div>
                )}

                {/* Calibrated badge */}
                {isCalibrated && (
                  <div className="absolute bottom-4 bg-emerald-950/90 border border-emerald-500/50 text-emerald-300 px-4 py-1.5 rounded-full text-xs font-bold flex items-center gap-2 shadow-lg backdrop-blur-sm">
                    <CheckCircle className="size-4 text-emerald-400" />
                    <span>✓ Baseline Posture Calibrated (Centered)</span>
                  </div>
                )}
              </div>

              {calibrationError && (
                <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-500/40 bg-red-950/40 p-3 text-xs text-red-200">
                  <AlertTriangle className="size-4 shrink-0 text-red-400 mt-0.5" />
                  <span>{calibrationError}</span>
                </div>
              )}

              <div className="bg-[#282828] border border-zinc-700/50 rounded-xl p-4 text-xs text-zinc-300 space-y-1.5">
                <span className="font-bold text-[#b2b2b2] flex items-center gap-1.5">
                  <Eye className="size-4" /> Why calibrate?
                </span>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  Webcams are mounted at different heights and angles. Baseline calibration prevents false alarms when you glance at your keyboard or scratchpad naturally during problem solving.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col gap-3">
                {!isCalibrated ? (
                  <button
                    type="button"
                    disabled={isCalibrating}
                    onClick={runCalibration}
                    className="w-full min-h-11 bg-[#b2b2b2] hover:bg-[#9e9e9e] disabled:opacity-50 text-zinc-950 py-3 rounded-xl text-sm sm:text-xs font-bold transition cursor-pointer shadow-md flex items-center justify-center gap-2"
                  >
                    <Activity className="size-4" />
                    {isCalibrating
                      ? `Calibrating (${calibrationCountdown}s remaining)...`
                      : calibrationError
                      ? "Retry Calibration"
                      : "Start 3-Second Calibration"}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={isStartingSession}
                    onClick={finalizeOnboardingAndStartExam}
                    className="w-full min-h-11 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white py-3.5 rounded-xl text-sm sm:text-xs font-extrabold transition cursor-pointer shadow-lg shadow-emerald-950/40 flex items-center justify-center gap-2"
                  >
                    {isStartingSession ? (
                      <><Loader2 className="size-4 animate-spin" /> Connecting to proctoring server...</>
                    ) : (
                      <><Play className="size-4 fill-current" /> Begin Secure Examination</>
                    )}
                  </button>
                )}
                {isCalibrated && (
                  <p className="text-[10px] text-zinc-500 text-center">
                    The exam opens in full screen and your camera{assessment?.microphoneAnalysis ? " and microphone are" : " is"} recorded
                    for the whole session for faculty review. Leaving full screen, switching tabs, copy/paste and
                    right-click are logged.
                  </p>
                )}

                <div className="flex justify-between items-center px-1">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCalibration(false);
                      setShowPhotoCapture(true);
                    }}
                    className="text-zinc-500 hover:text-zinc-300 text-[11px] font-bold transition bg-transparent border-none cursor-pointer"
                  >
                    ← Back to Photo Verification
                  </button>
                  <span className="text-zinc-600 text-[11px]">Calibration is required</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col p-3 sm:p-4">
          <div className="max-w-[480px] w-full mx-auto my-auto rounded-3xl bg-[#222222] border border-zinc-800 p-5 sm:p-8 space-y-5 sm:space-y-6 shadow-2xl">
            <div className="text-center space-y-2">
              <span className="text-[10px] font-bold text-[#b2b2b2] uppercase tracking-wider">IntegrityOS System Check</span>
              <h2 className="text-xl font-bold">{assessment.title}</h2>
              <p className="text-xs text-zinc-400">Duration: {assessment.duration} mins • Connected via matching institution policies.</p>
            </div>

            <div className="aspect-video bg-zinc-950 rounded-2xl border border-zinc-800 relative flex items-center justify-center overflow-hidden">
              {systemChecked && cameraStream ? (
                <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover" />
              ) : (
                <div className="text-center space-y-3">
                  <Camera className="size-12 text-zinc-700 mx-auto" />
                  <p className="text-xs text-zinc-500">Camera authorization is required before launching the exam.</p>
                </div>
              )}
            </div>

            <div className="rounded-xl bg-[#282828] border border-zinc-700/50 p-4 space-y-2">
              <span className="text-xs font-bold text-[#b2b2b2] flex items-center gap-1.5">
                <ShieldCheck className="size-4" /> Exam Security Policy
              </span>
              <ul className="text-[11px] text-zinc-400 space-y-1 pl-4 list-disc">
                <li>Webcam monitoring must remain active during the entire exam.</li>
                <li>Tab switching, window resizing, or screen minimizing will flag an alert.</li>
                <li>Ensure a quiet, well-lit private space with no background voices.</li>
              </ul>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3 border border-zinc-800 hover:bg-zinc-800 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Exit Portal
              </button>
              
              {!systemChecked ? (
                <button
                  type="button"
                  onClick={startCameraSetup}
                  className="flex-1 bg-[#b2b2b2] hover:bg-[#9e9e9e] text-zinc-950 py-3 rounded-xl text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Camera className="size-4" /> Check Webcam
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowPhotoCapture(true)}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-xl text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5 shadow-md shadow-emerald-950/20"
                >
                  <Play className="size-4 fill-current" /> Start Exam
                </button>
              )}
            </div>
          </div>
        </div>
      ) ) : (
        /* 2. SECURE EXAM ROOM ENVIRONMENT (responsive: phone / tablet / desktop) */
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row relative">
          {(() => {
            const currentQ = questions[activeIdx];
            const answeredCount = questions.filter((q) => hasAnswer(answers[q.id])).length;
            const timeUp = examStarted && !examFinished && timeLeft <= 0 && assessment?.autoSubmitOnExpiry === false;
            const lowTime = timeLeft > 0 && timeLeft <= 300;
            const monitoringHealthy =
              monitoringLinkOk &&
              (!agentHealth || (agentHealth.faceDetector === "ok" && agentHealth.objectDetector === "ok"));
            const healthLabel = (v?: string) =>
              v === "ok" || v === "match" || v === "genuine"
                ? { text: v === "match" ? "Verified" : "Running", cls: "text-emerald-400" }
                : v === "failed" || v === "mismatch" || v === "suspicious"
                ? { text: v === "mismatch" ? "Mismatch" : v === "suspicious" ? "Suspicious" : "Failed", cls: "text-rose-400" }
                : v === "no_frame"
                ? { text: "No frames", cls: "text-amber-400" }
                : v === "not_enrolled"
                ? { text: "Not enrolled", cls: "text-amber-400" }
                : { text: v ? "Pending" : "Starting", cls: "text-zinc-400" };

            return (
              <>
                {/* ---------- MAIN COLUMN ---------- */}
                <main className="flex-1 min-h-0 flex flex-col min-w-0">
                  {/* Top bar */}
                  <header className="shrink-0 flex items-center gap-2 sm:gap-3 border-b border-zinc-800 bg-[#1a1917]/95 backdrop-blur px-3 sm:px-6 lg:px-8 py-2.5 sm:py-3 pt-[max(0.625rem,env(safe-area-inset-top))]">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm sm:text-base lg:text-lg font-bold truncate">{assessment.title}</h3>
                      <span className="hidden sm:block text-[11px] text-zinc-400 truncate">
                        {assessment.institutionName ? `${assessment.institutionName} • ` : ""}Candidate: {user.name}
                      </span>
                    </div>

                    <span
                      className={`hidden sm:inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold border ${
                        monitoringHealthy
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                          : "border-amber-500/40 bg-amber-500/10 text-amber-300"
                      }`}
                      title={monitoringHealthy ? "AI proctoring agents are processing your camera" : "Proctoring telemetry is degraded"}
                    >
                      {monitoringHealthy ? <Wifi className="size-3" /> : <WifiOff className="size-3" />}
                      {monitoringHealthy ? "Proctoring active" : "Monitoring issue"}
                    </span>

                    {recording.status === "recording" && (
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full border border-red-500/40 bg-red-500/10 px-2.5 py-1 text-[10px] font-bold text-red-300"
                        title="This exam session is being recorded for faculty review"
                      >
                        <span className="size-2 rounded-full bg-red-500 animate-pulse" />
                        REC
                      </span>
                    )}
                    {monitoring.channel.beingWatched && (
                      <span
                        className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-sky-500/40 bg-sky-500/10 px-2.5 py-1 text-[10px] font-bold text-sky-300"
                        title="A faculty proctor is viewing your camera live"
                      >
                        <Eye className="size-3" /> Proctor viewing
                      </span>
                    )}

                    <div
                      className={`flex items-center gap-1.5 rounded-xl border px-2.5 sm:px-3.5 py-1.5 sm:py-2 ${
                        lowTime ? "border-red-500/60 bg-red-950/40" : "border-zinc-800 bg-[#222222]"
                      }`}
                      aria-live="polite"
                    >
                      <Clock className={`size-4 ${lowTime ? "text-red-400" : "text-[#b2b2b2]"}`} />
                      <span className={`text-sm font-extrabold font-mono tracking-wider ${lowTime ? "text-red-300" : "text-[#b2b2b2]"}`}>
                        {formatTime(timeLeft)}
                      </span>
                    </div>

                    {assessment.materialsAccessible && (
                      <button
                        type="button"
                        onClick={() => setShowMaterials(true)}
                        className="inline-flex items-center justify-center gap-1.5 min-h-10 rounded-xl border border-zinc-700 bg-[#222222] px-2.5 text-xs font-bold text-zinc-200 hover:bg-zinc-800 cursor-pointer"
                        aria-label="Open permitted reference materials"
                      >
                        <BookOpen className="size-4" />
                        <span className="hidden md:inline">Materials</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setShowPalette(true)}
                      className="lg:hidden inline-flex items-center justify-center gap-1.5 min-h-10 min-w-10 rounded-xl border border-zinc-700 bg-[#222222] px-2.5 text-xs font-bold text-zinc-200 cursor-pointer"
                      aria-label="Open questions and proctoring status"
                    >
                      <LayoutGrid className="size-4" />
                      <span className="hidden sm:inline">{answeredCount}/{questions.length}</span>
                    </button>
                  </header>

                  {/* Monitoring degraded banner (all sizes) */}
                  {!monitoringHealthy && (
                    <div role="status" className="shrink-0 flex items-start gap-2 bg-amber-950/60 border-b border-amber-700/40 px-3 sm:px-6 lg:px-8 py-2 text-[11px] sm:text-xs text-amber-200">
                      <ShieldAlert className="size-4 shrink-0 mt-0.5 text-amber-400" />
                      <span>
                        {!monitoringLinkOk
                          ? "We can't reach the proctoring server. Stay on this page; your answers are still saved."
                          : agentHealth?.faceDetector === "no_frame"
                          ? "Your camera isn't sending video. Check that it's connected and not used by another app."
                          : "Camera analysis is degraded. Improve lighting and face the screen."}
                      </span>
                    </div>
                  )}

                  {/* Question area */}
                  <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 sm:px-6 lg:px-8 py-4 sm:py-6">
                    {currentQ && (
                      <div className="max-w-3xl w-full mx-auto space-y-4 sm:space-y-5">
                        <div className="flex flex-wrap justify-between items-center gap-2">
                          <span className="text-xs font-bold text-zinc-400">
                            Question {activeIdx + 1} of {questions.length}
                          </span>
                          <span className="text-[11px] text-white bg-zinc-800 border border-zinc-700 rounded px-2.5 py-0.5 uppercase">
                            {currentQ.difficulty} • {currentQ.points} pts
                          </span>
                        </div>

                        {/* Progress bar */}
                        <div className="h-1 w-full rounded-full bg-zinc-800 overflow-hidden" aria-hidden="true">
                          <div
                            className="h-full bg-[#b2b2b2] transition-all duration-300"
                            style={{ width: `${questions.length ? (answeredCount / questions.length) * 100 : 0}%` }}
                          />
                        </div>

                        {/* Question Prompt */}
                        <div className="bg-[#222222] border border-zinc-800 rounded-2xl p-4 sm:p-6 shadow-md space-y-4">
                          <QuestionPrompt question={currentQ} />

                          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 border-t border-zinc-800/80 pt-3 text-xs">
                            <span className="text-zinc-400">Flag this question to review it later</span>
                            <button
                              key={`mark-${currentQ.id}`}
                              type="button"
                              onClick={() => {
                                const qId = currentQ.id;
                                const nextMarked = markedQuestions.includes(qId)
                                  ? markedQuestions.filter((id) => id !== qId)
                                  : [...markedQuestions, qId];
                                setMarkedQuestions(nextMarked);
                                saveStateToServer(answers, activeIdx, timeLeft, nextMarked, visitedQuestions);
                              }}
                              className={`min-h-10 px-3 py-1.5 rounded-lg border font-bold transition cursor-pointer w-full sm:w-auto ${
                                markedQuestions.includes(currentQ.id)
                                  ? "bg-amber-600 border-amber-500 text-white"
                                  : "border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                              }`}
                            >
                              {markedQuestions.includes(currentQ.id) ? "★ Marked for Review" : "☆ Mark for Review"}
                            </button>
                          </div>
                        </div>

                        {/* Answer inputs */}
                        <div className="space-y-3">
                          {timeUp && (
                            <div className="rounded-xl border border-amber-600/50 bg-amber-950/40 p-3 text-xs text-amber-200 flex flex-wrap items-center justify-between gap-2" role="alert">
                              <span>Time is up. Your answers are locked — submit the examination to finish.</span>
                              <button
                                type="button"
                                onClick={() => handleSubmit()}
                                disabled={isSubmitting}
                                className="rounded-lg bg-amber-500 px-3 py-1.5 font-bold text-zinc-950 hover:bg-amber-400 disabled:opacity-60 cursor-pointer"
                              >
                                Submit now
                              </button>
                            </div>
                          )}
                          {/* Own-answer area: copy/paste is allowed within it (see clipboard agent) */}
                          <div data-exam-answer="" className="select-text">
                            <QuestionAnswerInput
                              question={currentQ}
                              value={answers[currentQ.id]}
                              onChange={(v) => handleTextChange(currentQ.id, v)}
                              disabled={timeUp}
                              attemptId={attempt?.id}
                              timeLeftSeconds={timeLeft}
                            />
                          </div>
                        </div>

                        {recentProctorAlerts.length > 0 && (
                          <div className="rounded-xl border border-amber-700/40 bg-amber-950/30 p-3 text-[11px] text-amber-200 flex gap-2">
                            <AlertTriangle className="size-4 shrink-0 text-amber-400" />
                            <span className="break-words">Latest proctor notice: {recentProctorAlerts[0]}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Sticky footer navigation */}
                  <nav className="shrink-0 border-t border-zinc-800 bg-[#1a1917]/95 backdrop-blur px-3 sm:px-6 lg:px-8 py-2.5 sm:py-3 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
                    <div className="max-w-3xl mx-auto flex items-center gap-2 sm:gap-3">
                      <button
                        type="button"
                        disabled={activeIdx === 0}
                        onClick={() => handleNavigateQuestion(activeIdx - 1)}
                        className="min-h-11 flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 rounded-xl border border-zinc-800 px-4 text-xs font-bold text-zinc-300 hover:bg-zinc-800 transition disabled:opacity-30 cursor-pointer"
                      >
                        <ChevronLeft className="size-4" /> <span>Previous</span>
                      </button>

                      <span className="hidden sm:block flex-1 text-center text-[11px] text-zinc-500">
                        {answeredCount} of {questions.length} answered
                        {markedQuestions.length > 0 ? ` • ${markedQuestions.length} marked` : ""}
                      </span>

                      {activeIdx < questions.length - 1 ? (
                        <button
                          type="button"
                          onClick={() => handleNavigateQuestion(activeIdx + 1)}
                          className="min-h-11 flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#b2b2b2] hover:bg-[#9e9e9e] px-4 text-xs font-bold text-zinc-950 transition cursor-pointer"
                        >
                          <span>Next</span> <ChevronRight className="size-4" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={handleSubmit}
                          disabled={isSubmitting}
                          className="min-h-11 flex-1 sm:flex-none bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-5 rounded-xl shadow-lg transition cursor-pointer disabled:opacity-50"
                        >
                          {isSubmitting ? "Submitting..." : "Submit Exam"}
                        </button>
                      )}
                    </div>
                  </nav>
                </main>

                {/* ---------- DRAWER BACKDROP (phone/tablet) ---------- */}
                <div
                  className={`lg:hidden fixed inset-0 z-[55] bg-black/60 backdrop-blur-[1px] transition-opacity ${showPalette ? "opacity-100" : "opacity-0 pointer-events-none"}`}
                  onClick={() => setShowPalette(false)}
                  aria-hidden="true"
                />

                {/* ---------- SIDEBAR / DRAWER ----------
                    Always rendered (only translated off-screen on small screens) so the
                    main video element keeps decoding frames for the proctoring loop. */}
                <aside
                  className={`fixed lg:static inset-y-0 right-0 z-[60] w-[88vw] max-w-sm lg:w-[300px] xl:w-[320px] lg:max-w-none shrink-0 bg-[#222222] border-l border-zinc-800 flex flex-col transition-transform duration-300 ease-out lg:translate-x-0 ${
                    showPalette ? "translate-x-0" : "translate-x-full"
                  }`}
                  aria-label="Questions and proctoring status"
                >
                  <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 space-y-5 pt-[max(1rem,env(safe-area-inset-top))]">
                    {/* Candidate header */}
                    <div className="flex items-center gap-3">
                      <div className="size-11 rounded-xl border border-zinc-700 overflow-hidden bg-zinc-800 shrink-0">
                        {capturedPhoto ? (
                          <img src={capturedPhoto} className="w-full h-full object-cover" alt="Candidate" />
                        ) : (
                          <div className="size-full flex items-center justify-center text-zinc-500">
                            <ScanFace className="size-5" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="text-[9px] font-extrabold text-[#b2b2b2] uppercase tracking-wider block">Proctored candidate</span>
                        <p className="font-bold text-sm truncate">{user.name}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowPalette(false)}
                        className="lg:hidden min-h-10 min-w-10 inline-flex items-center justify-center rounded-xl border border-zinc-700 text-zinc-300 cursor-pointer"
                        aria-label="Close panel"
                      >
                        <X className="size-4" />
                      </button>
                    </div>

                    {/* Live session proctor (animated Vigil reacting to proctoring signals) */}
                    <LiveProctorMascot
                      integrityScore={integrityScore}
                      warningsCount={warningsCount}
                      faceStatus={faceStatus}
                      monitoringHealthy={monitoringHealthy}
                      recording={recording.status === "recording"}
                      beingWatched={monitoring.channel.beingWatched}
                      latestNotice={recentProctorAlerts[0]}
                    />

                    {/* Video stream */}
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Integrity video stream</span>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${cameraQuality?.usable === false ? "bg-amber-500/20 text-amber-400" : "bg-emerald-500/20 text-emerald-400"}`}>
                          {cameraQuality ? `${Math.round(cameraQuality.qualityScore)}% quality` : "Connecting"}
                        </span>
                      </div>
                      <div className="relative aspect-video rounded-xl bg-zinc-950 border border-zinc-800 overflow-hidden">
                        <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover -scale-x-100" />
                        <div className={`absolute top-2 left-2 size-2 rounded-full ${monitoringHealthy ? "bg-emerald-500 animate-pulse" : "bg-amber-500"}`} />
                        {currentPose && (
                          <div className="absolute bottom-1.5 left-2 bg-black/60 backdrop-blur-sm text-[9px] text-zinc-300 px-2 py-0.5 rounded font-mono">
                            Gaze: {currentPose.gazeDirection}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Integrity + confidence */}
                    <div className="bg-zinc-900/60 rounded-xl p-3 border border-zinc-800 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-zinc-300">Integrity score</span>
                        <span className={`text-sm font-extrabold ${integrityScore < 75 ? "text-amber-400" : "text-emerald-400"}`}>{integrityScore}%</span>
                      </div>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-zinc-400">Evidence confidence</span>
                        <span className={`font-bold ${(proctorMetrics?.evidenceConfidence ?? 0) < 60 ? "text-amber-400" : "text-zinc-200"}`}>
                          {proctorMetrics?.evidenceConfidence !== undefined ? `${proctorMetrics.evidenceConfidence}%` : "Calculating"}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 pt-2 text-[10px] text-zinc-400 border-t border-zinc-800/60">
                        {[
                          ["Identity", proctorMetrics?.identityScore],
                          ["Camera", cameraQuality ? Math.round(cameraQuality.qualityScore) : undefined],
                          ["Environment", proctorMetrics?.environmentScore],
                          ["Behaviour", proctorMetrics?.behaviorScore],
                        ].map(([label, value]) => (
                          <div key={label as string} className="flex justify-between">
                            <span>{label}</span>
                            <span className="font-bold text-zinc-200">{value !== undefined ? `${value}%` : "—"}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Agent health: shows whether agents are actually processing */}
                    <div className="space-y-2">
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Proctoring agents</span>
                      <div className="rounded-xl border border-zinc-800 divide-y divide-zinc-800/70 text-[11px]">
                        {[
                          ["Face analysis", healthLabel(agentHealth?.faceDetector)],
                          ["Object detection", healthLabel(agentHealth?.objectDetector)],
                          ["Identity check", healthLabel(agentHealth?.identity)],
                          ["Liveness", healthLabel(agentHealth?.liveness)],
                        ].map(([label, h]) => {
                          const hl = h as { text: string; cls: string };
                          return (
                            <div key={label as string} className="flex justify-between items-center px-3 py-2">
                              <span className="text-zinc-400">{label as string}</span>
                              <span className={`font-bold ${hl.cls}`}>{hl.text}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Client-side monitoring agents (run in this browser) */}
                    <div className="space-y-2">
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Browser agents</span>
                      <div className="rounded-xl border border-zinc-800 divide-y divide-zinc-800/70 text-[11px]">
                        {clientAgents.map((a) => (
                          <div key={a.id} className="flex justify-between items-center gap-2 px-3 py-2">
                            <span className="flex items-center gap-2 text-zinc-400 min-w-0">
                              <span
                                className={`size-1.5 rounded-full shrink-0 ${
                                  a.status === "running"
                                    ? "bg-emerald-500"
                                    : a.status === "alert"
                                    ? "bg-amber-500"
                                    : a.status === "degraded"
                                    ? "bg-rose-500"
                                    : "bg-zinc-600"
                                }`}
                              />
                              <span className="truncate">{a.name}</span>
                            </span>
                            <span
                              className={`font-bold shrink-0 ${
                                a.status === "running"
                                  ? "text-emerald-400"
                                  : a.status === "alert"
                                  ? "text-amber-400"
                                  : a.status === "degraded"
                                  ? "text-rose-400"
                                  : "text-zinc-500"
                              }`}
                            >
                              {a.detail}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Session status */}
                    <div className="rounded-xl border border-zinc-800 divide-y divide-zinc-800/70 text-[11px]">
                      <div className="flex justify-between items-center px-3 py-2">
                        <span className="text-zinc-400">Face status</span>
                        <span className={`font-bold ${faceStatus === "Detected" ? "text-emerald-400" : "text-rose-400"}`}>{faceStatus}</span>
                      </div>
                      <div className="flex justify-between items-center px-3 py-2">
                        <span className="text-zinc-400">Network</span>
                        <span className="font-bold flex items-center gap-1.5">
                          <span className={`size-2 rounded-full ${
                            networkStatus === "Excellent" ? "bg-emerald-500" :
                            networkStatus === "Good" ? "bg-yellow-500" :
                            networkStatus === "Slow" ? "bg-orange-500" :
                            networkStatus === "Poor" ? "bg-red-500" : "bg-zinc-500"
                          }`} />
                          {networkStatus} · <span className="font-mono font-normal">{latency} ms</span>
                        </span>
                      </div>
                      <div className="flex justify-between items-center px-3 py-2">
                        <span className="text-zinc-400">Tab switches</span>
                        <span className={`font-bold ${tabSwitches > 2 ? "text-red-400" : "text-zinc-200"}`}>{tabSwitches}</span>
                      </div>
                      <div className="flex justify-between items-center px-3 py-2">
                        <span className="text-zinc-400">Warnings</span>
                        <span className="font-bold text-amber-400">{warningsCount}</span>
                      </div>
                    </div>

                    {/* Questions palette */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Questions</span>
                        <span className="text-[10px] text-zinc-500">{answeredCount}/{questions.length} answered</span>
                      </div>
                      <div className="grid grid-cols-5 sm:grid-cols-6 lg:grid-cols-5 gap-2">
                        {questions.map((q, idx) => {
                          const isAnswered = hasAnswer(answers[q.id]);
                          const isActive = idx === activeIdx;
                          const isMarked = markedQuestions.includes(q.id);
                          return (
                            <button
                              key={q.id}
                              type="button"
                              onClick={() => {
                                handleNavigateQuestion(idx);
                                setShowPalette(false);
                              }}
                              aria-label={`Question ${idx + 1}${isAnswered ? ", answered" : ""}${isMarked ? ", marked for review" : ""}`}
                              aria-current={isActive ? "step" : undefined}
                              className={`aspect-square min-h-10 rounded-lg flex items-center justify-center text-xs font-extrabold border transition cursor-pointer relative ${
                                isActive
                                  ? "bg-[#b2b2b2] text-zinc-950 border-[#b2b2b2]"
                                  : isMarked
                                  ? "bg-amber-950/40 text-amber-300 border-amber-500"
                                  : isAnswered
                                  ? "bg-zinc-800 text-zinc-200 border-zinc-600"
                                  : "bg-transparent text-zinc-500 border-zinc-800 hover:border-zinc-700"
                              }`}
                            >
                              {idx + 1}
                              {isMarked && <span className="absolute top-0.5 right-0.5 size-1.5 rounded-full bg-amber-500" />}
                            </button>
                          );
                        })}
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-zinc-500 pt-1">
                        <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-zinc-700" /> Answered</span>
                        <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-amber-500" /> Marked</span>
                        <span className="flex items-center gap-1"><span className="size-2 rounded-sm border border-zinc-700" /> Not visited</span>
                      </div>
                    </div>
                  </div>

                  <div className="shrink-0 p-4 border-t border-zinc-800 flex gap-2 text-zinc-500 text-[10px] items-center pb-[max(1rem,env(safe-area-inset-bottom))]">
                    <HelpCircle className="size-4 shrink-0" />
                    <span>Keep your face visible and stay on this page. Proctor notices appear here and as alerts.</span>
                  </div>
                </aside>

                {/* ---------- FLOATING SELF-VIEW (phone/tablet) ---------- */}
                <button
                  type="button"
                  onClick={() => setShowPalette(true)}
                  className={`lg:hidden fixed right-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-40 w-24 sm:w-32 aspect-[4/3] rounded-xl overflow-hidden border-2 shadow-xl bg-zinc-950 cursor-pointer ${
                    monitoringHealthy ? "border-emerald-500/60" : "border-amber-500/80"
                  }`}
                  aria-label="Camera preview. Open proctoring status"
                >
                  <video ref={miniVideoRef} autoPlay playsInline muted className="w-full h-full object-cover -scale-x-100" />
                  <span className={`absolute top-1.5 left-1.5 size-2 rounded-full ${monitoringHealthy ? "bg-emerald-500 animate-pulse" : "bg-amber-500"}`} />
                  <span className="absolute bottom-0 inset-x-0 bg-black/60 text-[9px] font-bold text-zinc-200 py-0.5 text-center">
                    {integrityScore}% · {warningsCount} warn
                  </span>
                </button>
              </>
            );
          })()}
        </div>
      )}

      {/* Look Away Warning Alert Popup */}
      {showLookAwayAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="max-w-[420px] w-[calc(100%-2rem)] bg-[#222222] border-2 border-amber-500/80 rounded-3xl p-6 text-center space-y-4 shadow-2xl">
            <AlertTriangle className="size-16 text-amber-500 mx-auto animate-bounce" />
            <h3 className="text-lg font-bold text-white">⚠ Please Look at the Screen</h3>
            <p className="text-xs text-zinc-300 font-semibold">Your attention appears to be away from the examination.</p>
            <p className="text-xs text-zinc-450">Please continue focusing on the examination. Integrity score has been adjusted.</p>
            <button
              type="button"
              onClick={() => {
                setShowLookAwayAlert(false);
                setFaceStatus("Detected");
                toast.info("Returning to Examination...");
              }}
              className="bg-amber-600 hover:bg-amber-700 text-white font-extrabold px-5 py-2.5 rounded-xl text-xs transition cursor-pointer shadow-md"
            >
              Resume Focus
            </button>
          </div>
        </div>
      )}

      {/* Face Missing Warning Alert Popup */}
      {showFaceMissingAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="max-w-[420px] w-[calc(100%-2rem)] bg-[#222222] border-2 border-red-500/80 rounded-3xl p-6 text-center space-y-4 shadow-2xl">
            <ScanFace className="size-16 text-red-500 mx-auto animate-pulse" />
            <h3 className="text-lg font-bold text-white">⚠ Face Not Detected</h3>
            <p className="text-xs text-zinc-300 font-semibold">Your face is absent from the webcam stream view. Please align your face inside the frame.</p>
            <p className="text-xs text-zinc-450">AI Proctoring is actively monitoring your presence. Integrity score has been adjusted.</p>
            <button
              type="button"
              onClick={() => {
                setShowFaceMissingAlert(false);
                setFaceStatus("Detected");
                toast.info("Resuming Camera Onboarding...");
              }}
              className="bg-red-600 hover:bg-red-700 text-white font-extrabold px-5 py-2.5 rounded-xl text-xs transition cursor-pointer shadow-md"
            >
              Resume Focus
            </button>
          </div>
        </div>
      )}

      {/* Background Noise Warning Alert Popup */}
      {showNoiseAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="max-w-[420px] w-[calc(100%-2rem)] bg-[#222222] border-2 border-amber-500/80 rounded-3xl p-6 text-center space-y-4 shadow-2xl">
            <Volume2 className="size-16 text-amber-500 mx-auto animate-pulse" />
            <h3 className="text-lg font-bold text-white">⚠ Background Noise Detected</h3>
            <p className="text-xs text-zinc-300 font-semibold">Background sounds are coming. Please move to a quieter environment.</p>
            <p className="text-xs text-zinc-450">Conversational volume or repeated background voices are flagged by the AI agent.</p>
            <button
              type="button"
              onClick={() => {
                monitoring.audio.dismissAlert();
                toast.info("Resuming focus...");
              }}
              className="bg-amber-600 hover:bg-amber-700 text-white font-extrabold px-5 py-2.5 rounded-xl text-xs transition cursor-pointer shadow-md"
            >
              Quiet Environment Confirmed
            </button>
          </div>
        </div>
      )}

      {/* Slow Network Overlay Banner */}
      {showSlowNetworkAlert && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-50 bg-amber-600 text-white font-bold px-4 sm:px-5 py-3 rounded-2xl shadow-xl flex items-center gap-3 max-w-md w-[calc(100%-1.5rem)] sm:w-fit border border-amber-500 animate-in slide-in-from-top duration-300">
          <AlertTriangle className="size-5 shrink-0 animate-pulse" />
          <div className="text-xs text-left">
            <p className="font-extrabold text-sm">⚠ Network Connection is Slow</p>
            <p className="font-normal opacity-90 leading-tight mt-0.5">Your internet connection is unstable. Please avoid changing networks. Your answers continue to be saved automatically.</p>
          </div>
          <button 
            onClick={monitoring.network.dismissSlowAlert} 
            className="text-[10px] bg-white/20 hover:bg-white/35 px-2.5 py-1.5 rounded-lg shrink-0 font-bold uppercase transition"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Pre-exam voice briefing (first start only) */}
      {showBriefing && !examStarted && (
        <VoiceBriefing
          examTitle={assessment.title}
          onDone={() => {
            setShowBriefing(false);
            setExamStarted(true);
          }}
        />
      )}

      {/* Network hold: connection too slow to continue - timer frozen */}
      {networkHold && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="net-hold-title"
          className="fixed inset-0 z-[96] flex items-center justify-center bg-black p-6 select-none"
        >
          <div className="w-full max-w-[440px] bg-[#222222] border-2 border-amber-500/80 rounded-3xl p-6 sm:p-8 text-center space-y-5 shadow-2xl">
            <div className="size-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto text-amber-400">
              <WifiOff className="size-8" />
            </div>
            <div className="space-y-2">
              <h2 id="net-hold-title" className="text-xl font-bold text-white tracking-tight">Connection too slow to continue</h2>
              <p className="text-xs text-zinc-300 leading-relaxed">
                Your exam is paused and your timer is stopped at{" "}
                <span className="font-mono font-bold text-white">{formatTime(timeLeft)}</span>. Your answers are saved
                on this device.
              </p>
              <p className="flex items-center justify-center gap-2 text-[11px] text-zinc-400">
                <Loader2 className="size-3.5 animate-spin" />
                {networkStatus === "Offline" ? "Offline · waiting for connection" : `Checking connection · ${latency} ms`}
              </p>
            </div>
            <div className="rounded-xl bg-zinc-900/80 border border-zinc-800 p-3 text-[11px] text-zinc-400 text-left">
              The exam continues automatically when your connection recovers. If it does not, exit now and resume
              from your dashboard within {assessment.resumeTimeWindow ?? 15} minutes. You will get the remaining time.
            </div>
            <button
              type="button"
              disabled={isExitingForNetwork}
              onClick={() => void exitAndResumeLater()}
              className="w-full min-h-11 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-zinc-950 font-extrabold py-3 rounded-xl text-sm transition cursor-pointer shadow-md flex items-center justify-center gap-2"
            >
              {isExitingForNetwork && <Loader2 className="size-4 animate-spin" />}
              {isExitingForNetwork ? "Saving and exiting..." : "Exit & resume later"}
            </button>
          </div>
        </div>
      )}

      {/* Offline Loss of Connection Reconnect Overlay */}
      {networkStatus === "Offline" && !networkHold && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 backdrop-blur-md text-[#fcfcfc] p-6 select-none animate-in fade-in duration-300">
          <div className="w-full max-w-sm bg-[#222222] border-2 border-red-500 rounded-3xl p-8 flex flex-col items-center gap-5 text-center shadow-2xl">
            <Loader2 className="size-14 animate-spin text-red-500" />
            <h2 className="text-lg font-extrabold text-white">⚠ Internet Connection Lost</h2>
            <p className="text-xs text-zinc-300 font-semibold">Trying to reconnect...</p>
            <p className="text-[11px] text-zinc-500">Your answers are safe. Please remain on this page. Do not refresh.</p>
          </div>
        </div>
      )}

      {/* Resume Attempt Modal */}
      {showResumeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="max-w-[420px] w-[calc(100%-2rem)] bg-[#222222] border border-zinc-800 rounded-3xl p-6 sm:p-8 text-center space-y-5 shadow-2xl relative overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-[#b2b2b2]/40 to-transparent" />
            <ShieldCheck className="size-16 text-[#b2b2b2] mx-auto animate-pulse" />
            <h3 className="text-lg font-bold text-white">Resume Assessment</h3>
            <p className="text-xs text-zinc-300">An active assessment attempt was detected. Continue where you left off.</p>
            <p className="text-[11.5px] text-zinc-500">Your answers are restored. Your camera and proctoring session will reconnect before you continue.</p>
            <button
              type="button"
              disabled={isStartingSession}
              onClick={resumeProctoredSession}
              className="w-full min-h-11 bg-[#b2b2b2] hover:bg-[#9e9e9e] disabled:opacity-60 text-zinc-950 font-extrabold py-3 rounded-xl text-sm sm:text-xs transition cursor-pointer shadow-md flex items-center justify-center gap-2"
            >
              {isStartingSession && <Loader2 className="size-4 animate-spin" />}
              {isStartingSession ? "Reconnecting camera and proctoring..." : "Resume Assessment"}
            </button>
          </div>
        </div>
      )}

      {/* Full-screen enforcement: the exam stays hidden until full screen is restored */}
      {assessment?.id && examStarted && !examFinished && (
        <ExamMaterialsPanel assessmentId={assessment.id} open={showMaterials} onClose={() => setShowMaterials(false)} />
      )}

      {examStarted && !examFinished && fullscreen.needsReentry && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="fs-required-title"
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black p-6 select-none"
        >
          <div className="max-w-[440px] w-full bg-[#222222] border-2 border-amber-500/80 rounded-3xl p-6 sm:p-8 text-center space-y-5 shadow-2xl">
            <div className="size-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto text-amber-400">
              <ShieldAlert className="size-8" />
            </div>
            <div className="space-y-2">
              <h2 id="fs-required-title" className="text-xl font-bold text-white tracking-tight">Full screen required</h2>
              <p className="text-xs text-zinc-300 leading-relaxed">
                This assessment must stay in full-screen mode. Leaving full screen is logged to your proctor
                {fullscreen.exitCount > 0 ? ` (${fullscreen.exitCount} ${fullscreen.exitCount === 1 ? "exit" : "exits"} so far)` : ""}.
              </p>
              <p className="text-[11px] text-zinc-500">Your timer is still running and your answers are saved.</p>
            </div>
            <button
              type="button"
              autoFocus
              onClick={() => void fullscreen.requestReentry()}
              className="w-full min-h-11 bg-amber-500 hover:bg-amber-600 text-zinc-950 font-extrabold py-3 rounded-xl text-sm transition cursor-pointer shadow-md"
            >
              Return to full screen
            </button>
          </div>
        </div>
      )}

      {/* Camera disconnected: monitoring and recording need a live camera */}
      {examStarted && !examFinished && device.cameraLost && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="camera-lost-title"
          className="fixed inset-0 z-[95] flex items-center justify-center bg-black p-6 select-none"
        >
          <div className="max-w-[440px] w-full bg-[#222222] border-2 border-red-500/80 rounded-3xl p-6 sm:p-8 text-center space-y-5 shadow-2xl">
            <div className="size-16 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center mx-auto text-red-400">
              <Camera className="size-8" />
            </div>
            <div className="space-y-2">
              <h2 id="camera-lost-title" className="text-xl font-bold text-white tracking-tight">Camera disconnected</h2>
              <p className="text-xs text-zinc-300 leading-relaxed">
                Your camera stopped. This has been logged to your proctor. Reconnect it to continue — your timer is
                still running and your answers are saved.
              </p>
            </div>
            <button
              type="button"
              autoFocus
              disabled={isReconnectingCamera}
              onClick={() => void reconnectCamera()}
              className="w-full min-h-11 bg-red-500 hover:bg-red-600 disabled:opacity-60 text-white font-extrabold py-3 rounded-xl text-sm transition cursor-pointer shadow-md flex items-center justify-center gap-2"
            >
              {isReconnectingCamera && <Loader2 className="size-4 animate-spin" />}
              {isReconnectingCamera ? "Reconnecting..." : "Reconnect camera"}
            </button>
          </div>
        </div>
      )}

      {/* Proctor Intervention Suspension Modal Overlay */}
      {isExamSuspended && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-md p-6 select-none animate-in fade-in duration-300">
          <div className="max-w-[460px] w-full bg-[#222222] border-2 border-red-500 rounded-3xl p-6 sm:p-8 text-center space-y-5 shadow-2xl relative overflow-hidden">
            <div className="size-16 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center mx-auto text-red-400">
              <AlertTriangle className="size-8 animate-pulse" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-white tracking-tight">Assessment Interrupted</h2>
              <p className="text-xs text-red-300 font-semibold leading-relaxed">
                {suspensionMessage || "Your assessment has been paused by the Proctoring Orchestrator."}
              </p>
            </div>
            <div className="bg-zinc-900/80 rounded-xl p-3 border border-zinc-800 text-[11px] text-zinc-400 text-left space-y-1">
              <span className="font-bold text-zinc-200 block">Investigator Action Required:</span>
              <p>The faculty supervisor has been alerted to review the recorded telemetry signals. Please keep your webcam active and remain at your seat.</p>
            </div>
            <p className="text-[10px] text-zinc-500">Session recovery will resume automatically once approved by the proctor.</p>
          </div>
        </div>
      )}

      {showFeedbackAgent && attempt && (
        <PostExamFeedbackAgent
          attemptId={attempt.id}
          assessmentTitle={assessment?.title}
          studentName={user?.name}
          onDone={onClose}
        />
      )}

      {showAnimation && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#ffffff]/95 backdrop-blur-md text-[#1a1917] p-6 select-none animate-in fade-in duration-300">
          <div className="w-full max-w-md bg-white border-2 border-[#c4c4c4]/80 rounded-[32px] shadow-[0px_24px_48px_-8px_rgba(128,128,128,0.22)] p-8 md:p-10 flex flex-col items-center gap-6 relative overflow-hidden">
            <div className="absolute -top-[20%] -left-[20%] w-48 h-48 rounded-full bg-[#dedede]/40 blur-3xl pointer-events-none" />

            <div className="relative flex items-center justify-center size-20">
              <svg className="size-full transform -rotate-90">
                <circle
                  cx="40"
                  cy="40"
                  r="36"
                  className="stroke-[#dedede]/60"
                  strokeWidth="6"
                  fill="transparent"
                />
                <circle
                  cx="40"
                  cy="40"
                  r="36"
                  className="stroke-[#b2b2b2] transition-all duration-500 ease-out"
                  strokeWidth="6"
                  fill="transparent"
                  strokeDasharray={2 * Math.PI * 36}
                  strokeDashoffset={2 * Math.PI * 36 * (1 - (currentStepIdx + 1) / SUBMISSION_STEPS.length)}
                />
              </svg>
              <div className="absolute text-sm font-extrabold text-[#1a1917]">
                {Math.round(((currentStepIdx + 1) / SUBMISSION_STEPS.length) * 100)}%
              </div>
            </div>

            <div className="text-center space-y-1.5 w-full">
              <h2 className="text-lg font-extrabold text-[#1a1917] tracking-tight">Processing Attempt Submission</h2>
              <p className="text-xs text-[#8a8a8a] font-semibold">Please do not close your browser or navigate away</p>
            </div>

            <div className="w-full space-y-2.5 bg-[#f9f9f9] border border-[#dedede]/40 rounded-2xl p-4.5 max-h-56 overflow-y-auto">
              {SUBMISSION_STEPS.map((step, idx) => {
                const isCompleted = idx < currentStepIdx;
                const isActive = idx === currentStepIdx;
                const isPending = idx > currentStepIdx;

                return (
                  <div
                    key={idx}
                    className={`flex items-center gap-3 text-xs font-semibold transition-all duration-300 ${
                      isActive ? "text-[#1a1917] scale-105" : isCompleted ? "text-emerald-600" : "text-[#8a8a8a]/50"
                    }`}
                  >
                    {isCompleted ? (
                      <span className="size-4.5 rounded-full bg-emerald-100 flex items-center justify-center text-[10px] font-bold text-emerald-600 shrink-0">✓</span>
                    ) : isActive ? (
                      <Loader2 className="size-4 animate-spin text-[#b2b2b2] shrink-0" />
                    ) : (
                      <span className="size-4.5 rounded-full bg-[#dedede]/20 flex items-center justify-center text-[9px] text-[#8a8a8a]/30 shrink-0">•</span>
                    )}
                    <span className="truncate">{step}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
