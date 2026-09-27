import React, { useState, useEffect, useRef } from "react";
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
  Eye
} from "lucide-react";
import { toast } from "sonner";
import { io } from "socket.io-client";

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

  // Proctoring Onboarding Verification States
  const [showPhotoCapture, setShowPhotoCapture] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [faceAligned, setFaceAligned] = useState(false);
  const [detectionProgress, setDetectionProgress] = useState(0);
  const [isAutoCapturing, setIsAutoCapturing] = useState(false);
  const captureVideoRef = useRef<HTMLVideoElement | null>(null);

  // 3-Second Camera Posture Calibration States
  const [showCalibration, setShowCalibration] = useState(false);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [calibrationCountdown, setCalibrationCountdown] = useState(3);
  const [isCalibrated, setIsCalibrated] = useState(false);
  const calibrationVideoRef = useRef<HTMLVideoElement | null>(null);

  // Multi-Dimensional Proctoring Metrics & Camera Quality States
  const [proctorMetrics, setProctorMetrics] = useState<any | null>(null);
  const [cameraQuality, setCameraQuality] = useState<{
    qualityScore: number;
    usable: boolean;
    lightingState: string;
    brightness: number;
    blur: number;
    faceVisibility: number;
  } | null>(null);
  const [currentPose, setCurrentPose] = useState<any | null>(null);
  const [isExamSuspended, setIsExamSuspended] = useState(false);
  const [suspensionMessage, setSuspensionMessage] = useState("");
  const [recentProctorAlerts, setRecentProctorAlerts] = useState<string[]>([]);
  
  // Timer state
  const [timeLeft, setTimeLeft] = useState(0); // seconds
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAnimation, setShowAnimation] = useState(false);
  const [currentStepIdx, setCurrentStepIdx] = useState(0);

  // Tab switch count state
  const [tabSwitches, setTabSwitches] = useState(0);

  // Telemetry and recovery states
  const [networkStatus, setNetworkStatus] = useState<"Excellent" | "Good" | "Slow" | "Poor" | "Offline">("Excellent");
  const [latency, setLatency] = useState(42);
  const [faceStatus, setFaceStatus] = useState<string>("Detected");
  const [backgroundNoise, setBackgroundNoise] = useState<string>("Quiet");
  const [warningsCount, setWarningsCount] = useState(0);
  const [integrityScore, setIntegrityScore] = useState(100);
  const [markedQuestions, setMarkedQuestions] = useState<string[]>([]);
  const [visitedQuestions, setVisitedQuestions] = useState<string[]>([]);
  const [showSlowNetworkAlert, setShowSlowNetworkAlert] = useState(false);
  const [showLookAwayAlert, setShowLookAwayAlert] = useState(false);
  const [showFaceMissingAlert, setShowFaceMissingAlert] = useState(false);
  const [showNoiseAlert, setShowNoiseAlert] = useState(false);
  const [examFinished, setExamFinished] = useState(false);
  const [showResumeModal, setShowResumeModal] = useState(false);

  // Fetch assessment and start/resume attempt
  // Fetch assessment and start/resume attempt
  const initializeExam = async () => {
    try {
      const res = await fetch(`/api/assessments/${assessmentId}`, {
        headers: { "x-user-id": user.id, "x-user-role": "user" }
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
          body: JSON.stringify({ resumeReason: "disconnect" })
        });
        
        if (attemptRes.ok) {
          const attemptData = await attemptRes.json();
          const attemptObj = attemptData.data.attempt;
          setAttempt(attemptObj);
          setQuestions(attemptData.data.questions || []);
          
          // Restore answers
          if (attemptObj.answers && attemptObj.answers.length > 0) {
            const initialAnswers: Record<string, string> = {};
            attemptObj.answers.forEach((ans: any) => {
              initialAnswers[ans.questionId] = ans.response;
            });
            setAnswers(initialAnswers);
          }

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
      toast.error("An error occurred during system checks.");
      onClose();
    }
  };

  useEffect(() => {
    initializeExam();
  }, [assessmentId]);

  // Request webcam stream during setup phase
  const startCameraSetup = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
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

  // Automated Facial Detection Simulation
  useEffect(() => {
    if (!showPhotoCapture || capturedPhoto) return;

    setDetectionProgress(0);
    setFaceAligned(false);
    setIsAutoCapturing(true);

    let progressInterval: NodeJS.Timeout;

    // Simulate detection scan after 1 second delay
    const delayTimeout = setTimeout(() => {
      progressInterval = setInterval(() => {
        setDetectionProgress((prev) => {
          if (prev >= 100) {
            clearInterval(progressInterval);
            
            // Execute automated photo capture
            if (captureVideoRef.current) {
              const canvas = document.createElement("canvas");
              canvas.width = 640;
              canvas.height = 480;
              const ctx = canvas.getContext("2d");
              if (ctx && captureVideoRef.current) {
                ctx.drawImage(captureVideoRef.current, 0, 0, 640, 480);
                const dataUrl = canvas.toDataURL("image/jpeg");
                
                fetch("/api/proctoring/face-check", {
                  method: "POST",
                  headers: { 
                    "Content-Type": "application/json",
                    "x-user-id": user.id,
                    "x-user-role": "user"
                  },
                  body: JSON.stringify({ selfie: dataUrl })
                })
                .then(res => res.json())
                .then(resData => {
                  if (resData.success && resData.data.faceDetected) {
                    setCapturedPhoto(dataUrl);
                    setFaceAligned(true);
                    toast.success("AI Proctor: Face detected and aligned! Onboarding photo verified.");
                  } else {
                    setDetectionProgress(0);
                    setFaceAligned(false);
                    toast.error(resData.message || resData.data?.message || "AI Proctor: Face not detected. Retrying...");
                  }
                })
                .catch(() => {
                  setDetectionProgress(0);
                  setFaceAligned(false);
                  toast.error("AI Proctor: Connection error. Retrying...");
                });
              }
            }
            return 100;
          }
          return prev + 10;
        });
      }, 200);
    }, 1000);

    return () => {
      clearTimeout(delayTimeout);
      if (progressInterval) clearInterval(progressInterval);
      setIsAutoCapturing(false);
    };
  }, [showPhotoCapture, capturedPhoto]);

  const handleManualCapture = async () => {
    if (!captureVideoRef.current) return;
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext("2d");
    if (ctx && captureVideoRef.current) {
      ctx.drawImage(captureVideoRef.current, 0, 0, 640, 480);
      const dataUrl = canvas.toDataURL("image/jpeg");
      
      try {
        const res = await fetch("/api/proctoring/face-check", {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "x-user-id": user.id,
            "x-user-role": "user"
          },
          body: JSON.stringify({ selfie: dataUrl })
        });
        const resData = await res.json();
        if (res.ok && resData.success && resData.data.faceDetected) {
          setCapturedPhoto(dataUrl);
          setFaceAligned(true);
          setDetectionProgress(100);
          toast.success("Manual photo capture verified.");
        } else {
          toast.error(resData.message || resData.data?.message || "Manual photo capture verification failed: No face detected.");
        }
      } catch (err) {
        toast.error("Error contacting face check service.");
      }
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

  // Execute 3-Second Camera Posture Baseline Calibration
  const runCalibration = async () => {
    setIsCalibrating(true);
    setCalibrationCountdown(3);
    let count = 3;

    const timer = setInterval(() => {
      count -= 1;
      if (count <= 0) {
        clearInterval(timer);

        const videoEl = calibrationVideoRef.current || captureVideoRef.current || videoRef.current;
        if (videoEl && attempt) {
          const canvas = document.createElement("canvas");
          canvas.width = 480;
          canvas.height = 360;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(videoEl, 0, 0, 480, 360);
            const dataUrl = canvas.toDataURL("image/jpeg", 0.75);

            fetch("/api/ai-proctoring/calibrate", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-user-id": user.id,
                "x-user-role": "user",
              },
              body: JSON.stringify({
                attemptId: attempt.id,
                frame: dataUrl,
              }),
            })
              .then((r) => r.json())
              .then(() => {
                setIsCalibrating(false);
                setIsCalibrated(true);
                toast.success("Camera posture baseline calibrated successfully!");
              })
              .catch(() => {
                setIsCalibrating(false);
                setIsCalibrated(true);
                toast.info("Calibration established with standard center baseline.");
              });
          }
        } else {
          setIsCalibrating(false);
          setIsCalibrated(true);
        }
      } else {
        setCalibrationCountdown(count);
      }
    }, 1000);
  };

  const finalizeOnboardingAndStartExam = async () => {
    if (attempt) {
      try {
        await fetch("/api/ai-proctoring/start-session", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-user-id": user.id,
            "x-user-role": "user",
          },
          body: JSON.stringify({ attemptId: attempt.id }),
        });
      } catch (err) {
        console.warn("Start session error:", err);
      }
    }
    setShowCalibration(false);
    setShowPhotoCapture(false);
    setExamStarted(true);
  };

  // Timer countdown hook
  useEffect(() => {
    if (!examStarted || timeLeft <= 0 || examFinished) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleAutoSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [examStarted, timeLeft, examFinished]);

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
      progress: questions.length > 0 ? Math.round((Object.keys(customAnswers || answers).length / questions.length) * 100) : 0,
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

  // Network connection latency loop
  useEffect(() => {
    if (!examStarted || !attempt) return;

    const interval = setInterval(async () => {
      if (!navigator.onLine) {
        setNetworkStatus("Offline");
        setLatency(0);
        return;
      }

      const start = performance.now();
      try {
        const res = await fetch(
  "https://assessment-integrity-backend-0w4b.onrender.com/api/health",
  {
    method: "HEAD",
    cache: "no-store",
  }
);
        if (res.ok) {
          const diff = Math.round(performance.now() - start);
          setLatency(diff);
          
          let nextStatus: "Excellent" | "Good" | "Slow" | "Poor" = "Excellent";
          if (diff < 50) nextStatus = "Excellent";
          else if (diff < 100) nextStatus = "Good";
          else if (diff < 250) nextStatus = "Slow";
          else nextStatus = "Poor";

          setNetworkStatus(nextStatus);

          // Trigger Slow Network Warning
          if (nextStatus === "Slow" || nextStatus === "Poor") {
            setShowSlowNetworkAlert(true);
            try {
              await fetch(`/api/assessments/attempts/${attempt.id}/violation`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "x-user-id": user.id,
                  "x-user-role": "user"
                },
                body: JSON.stringify({
                  type: "slow-network",
                  severity: "low",
                  description: `Slow connection detected: latency ${diff} ms.`
                })
              });
              setWarningsCount(w => w + 1);
              setIntegrityScore(s => Math.max(0, s - 2));
            } catch {}
          } else {
            setShowSlowNetworkAlert(false);
          }
        } else {
          setNetworkStatus("Offline");
          setLatency(0);
        }
      } catch {
        setNetworkStatus("Offline");
        setLatency(0);
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [examStarted, attempt, networkStatus, examFinished]);

  // Online/Offline recovery sync
  useEffect(() => {
    if (!examStarted || !attempt || examFinished) return;

    const handleOnline = async () => {
      setNetworkStatus("Good");
      const offlineAnswers = await getOfflineAnswers();
      if (offlineAnswers.length > 0) {
        const updatedAnswers = { ...answers };
        offlineAnswers.forEach((ans) => {
          updatedAnswers[ans.questionId] = ans.response;
        });
        setAnswers(updatedAnswers);
        
        await saveStateToServer(updatedAnswers);
        await clearOfflineAnswers();
        toast.success("✔ Answers Synced Successfully");
        
        try {
          await fetch(`/api/assessments/attempts/${attempt.id}/violation`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-user-id": user.id,
              "x-user-role": "user"
            },
            body: JSON.stringify({
              type: "internet-reconnect",
              severity: "low",
              description: "Internet connection restored. Answers synced successfully."
            })
          });
        } catch {}
      }
    };

    const handleOffline = async () => {
      setNetworkStatus("Offline");
      try {
        await fetch(`/api/assessments/attempts/${attempt.id}/violation`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-user-id": user.id,
            "x-user-role": "user"
          },
          body: JSON.stringify({
            type: "internet-disconnect",
            severity: "medium",
            description: "Internet connection was disconnected."
          })
        });
        setWarningsCount(w => w + 1);
        setIntegrityScore(s => Math.max(0, s - 5));
      } catch {}
    };
    
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [examStarted, attempt, answers, examFinished]);

  // Monitor visibility / tab switches
  useEffect(() => {
    if (!examStarted || !attempt || examFinished) return;

    const handleVisibilityChange = async () => {
      if (document.hidden) {
        setTabSwitches((prev) => prev + 1);
        toast.warning("WARNING: Tab switch detected! This event has been logged to the proctoring dashboard.");
        
        try {
          await fetch(`/api/assessments/attempts/${attempt.id}/violation`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-user-id": user.id,
              "x-user-role": "user"
            },
            body: JSON.stringify({
              type: "tab-switch",
              severity: "medium",
              description: "Candidate switched browser tabs or minimized the assessment environment."
            })
          });
          setWarningsCount(w => w + 1);
          setIntegrityScore(s => Math.max(0, s - 10));
        } catch (err) {
          console.error("Failed to log violation:", err);
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [examStarted, attempt, examFinished]);

  // Microphone audio background noise analyser
  useEffect(() => {
    if (!examStarted || !cameraStream || !attempt || !assessment?.microphoneAnalysis || examFinished) return;
    
    let audioContext: AudioContext;
    let analyser: AnalyserNode;
    let microphone: MediaStreamAudioSourceNode;
    let javascriptNode: ScriptProcessorNode;
    let lastNoiseTime = 0;
    
    const startAudioMonitor = async () => {
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        microphone = audioContext.createMediaStreamSource(audioStream);
        javascriptNode = audioContext.createScriptProcessor(2048, 1, 1);
        
        analyser.smoothingTimeConstant = 0.8;
        analyser.fftSize = 1024;
        
        microphone.connect(analyser);
        analyser.connect(javascriptNode);
        javascriptNode.connect(audioContext.destination);
        
        javascriptNode.onaudioprocess = () => {
          const array = new Uint8Array(analyser.frequencyBinCount);
          analyser.getByteFrequencyData(array);
          let values = 0;
          const length = array.length;
          for (let i = 0; i < length; i++) {
            values += array[i];
          }
          const average = values / length;
          
          if (average > 35) {
            const now = Date.now();
            if (now - lastNoiseTime > 8000) {
              lastNoiseTime = now;
              setBackgroundNoise("Noise Detected");
              toast.error("⚠ Background Noise Detected. Please move to a quieter environment.");
              setShowNoiseAlert(true);
              
              fetch(`/api/assessments/attempts/${attempt.id}/violation`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "x-user-id": user.id,
                  "x-user-role": "user"
                },
                body: JSON.stringify({
                  type: "background-noise",
                  severity: "medium",
                  description: "Microphone analysis: Loud conversational volume or repeated background voices detected."
                })
              })
              .then(() => {
                setWarningsCount(w => w + 1);
                setIntegrityScore(s => Math.max(0, s - 10));
              })
              .catch(() => {});

              setTimeout(() => {
                setBackgroundNoise("Quiet");
              }, 4000);
            }
          }
        };
      } catch (err) {
        console.error("Microphone check failed:", err);
      }
    };
    
    startAudioMonitor();
    return () => {
      if (javascriptNode) javascriptNode.disconnect();
      if (microphone) microphone.disconnect();
      if (audioContext) audioContext.close();
    };
  }, [examStarted, cameraStream, attempt, assessment, examFinished]);

  // Real-time AI Proctoring Frame Processor (Runs computer-vision & temporal engine every 2.5s)
  useEffect(() => {
    if (!examStarted || !attempt || examFinished || !cameraStream) return;

    const proctorInterval = setInterval(async () => {
      if (!videoRef.current || videoRef.current.videoWidth === 0) return;

      try {
        const canvas = document.createElement("canvas");
        canvas.width = 480;
        canvas.height = 360;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(videoRef.current, 0, 0, 480, 360);
        const frameData = canvas.toDataURL("image/jpeg", 0.7);

        const res = await fetch("/api/ai-proctoring/process-frame", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-user-id": user.id,
            "x-user-role": "user",
          },
          body: JSON.stringify({
            attemptId: attempt.id,
            frame: frameData,
            browserEvent: {
              tabSwitches,
              isDevToolsOpen: false,
              visibilityHidden: document.hidden,
            },
            networkDetails: {
              status: networkStatus,
              latency,
            },
          }),
        });

        if (res.ok) {
          const payload = await res.json();
          const data = payload.data;
          if (data) {
            if (data.integrityScore !== undefined) {
              setIntegrityScore(data.integrityScore);
            }
            if (data.metrics) {
              setProctorMetrics(data.metrics);
            }
            if (data.quality) {
              setCameraQuality(data.quality);
            }
            if (data.pose) {
              setCurrentPose(data.pose);
              if (data.pose.isLookingAway) {
                setFaceStatus("Looking Away");
              } else {
                setFaceStatus("Detected");
              }
            }
            if (data.warningCount !== undefined) {
              setWarningsCount(data.warningCount);
            }

            // Handle actions from proctor orchestrator agent
            if (data.action === "pause") {
              setIsExamSuspended(true);
              setSuspensionMessage("Assessment paused by Proctor Orchestrator due to security flags.");
            } else if (data.action === "warning" && data.newEvents?.length > 0) {
              const notice = data.newEvents[0].narrativeExplanation || "Please keep your attention on screen.";
              toast.warning(`Proctor Notice: ${notice}`);
              setRecentProctorAlerts((prev) => [notice, ...prev].slice(0, 5));
            }
          }
        }
      } catch (err) {
        console.warn("AI proctoring frame stream warning:", err);
      }
    }, 2500);

    return () => clearInterval(proctorInterval);
  }, [examStarted, attempt, examFinished, cameraStream, tabSwitches, networkStatus, latency]);

  // Real-time Socket.IO listener for live proctor interventions
  useEffect(() => {
    if (!examStarted || !attempt) return;

    const socket = io();
    socket.emit("join-room", `student-proctoring-${attempt.id}`);

    socket.on("proctor-action", (data: { action: string; status: string; message: string }) => {
      if (data.action === "pause-exam") {
        setIsExamSuspended(true);
        setSuspensionMessage(data.message || "Exam suspended by Faculty Proctor.");
      } else if (data.action === "resume-exam") {
        setIsExamSuspended(false);
        setSuspensionMessage("");
        toast.success("Examination resumed by Faculty Invigilator.");
      } else if (data.action === "terminate-exam") {
        setIsExamSuspended(true);
        setSuspensionMessage(data.message || "Exam terminated by Faculty Proctor.");
        setExamFinished(true);
      } else if (data.action === "warning") {
        toast.warning(`Faculty Notice: ${data.message || "Please maintain focus on the examination."}`);
        setWarningsCount((w) => w + 1);
        setRecentProctorAlerts((prev) => [data.message, ...prev].slice(0, 5));
      }
    });

    return () => {
      socket.emit("leave-room", `student-proctoring-${attempt.id}`);
      socket.disconnect();
    };
  }, [examStarted, attempt]);

  // Developer tools detection listener
  useEffect(() => {
    if (!examStarted || !attempt || !assessment?.browserLockdown || examFinished) return;
    
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (
        e.key === "F12" ||
        (e.ctrlKey && e.shiftKey && (e.key === "I" || e.key === "J" || e.key === "C")) ||
        (e.ctrlKey && e.key === "u")
      ) {
        e.preventDefault();
        toast.error("WARNING: Developer Tools are restricted during examination!");
        
        try {
          await fetch(`/api/assessments/attempts/${attempt.id}/violation`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-user-id": user.id,
              "x-user-role": "user"
            },
            body: JSON.stringify({
              type: "developer-tools",
              severity: "high",
              description: "Student attempted to open browser Developer Tools."
            })
          });
          setWarningsCount(w => w + 1);
          setIntegrityScore(s => Math.max(0, s - 50));
        } catch {}
      }
    };
    
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [examStarted, attempt, assessment, examFinished]);

  // Report progress changes to backend
  const updateProgressPercent = async (updatedAnswers: Record<string, string>) => {
    if (!attempt || questions.length === 0) return;
    const answeredCount = Object.keys(updatedAnswers).length;
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

  useEffect(() => {
    if (!showAnimation) return;
    
    const interval = setInterval(() => {
      setCurrentStepIdx((prev) => {
        if (prev >= SUBMISSION_STEPS.length - 1) {
          clearInterval(interval);
          onClose();
          return prev;
        }
        return prev + 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [showAnimation, onClose]);

  const handleSubmit = async () => {
    if (isSubmitting || !attempt) return;
    setIsSubmitting(true);

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

  if (!assessment || !attempt) {
    return (
      <div className="min-h-screen bg-[#F5EEDC] flex items-center justify-center">
        <div className="text-center space-y-2">
          <div className="animate-spin size-8 border-4 border-[#c5af8a] border-t-transparent rounded-full mx-auto" />
          <p className="text-sm font-bold text-[#8e8a80]">Initializing assessment shields...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-[#1a1917] text-[#fffcf7] flex flex-col font-sans select-none overflow-hidden relative">
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
          <div className="flex-1 flex items-center justify-center p-4">
            <div className="max-w-[500px] w-full rounded-3xl bg-[#242220] border border-zinc-800 p-8 space-y-6 shadow-2xl relative overflow-hidden">
              <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-[#c5af8a]/40 to-transparent" />
              
              <div className="text-center space-y-2">
                <span className="text-[10px] font-bold text-[#c5af8a] uppercase tracking-wider block">Step 2: Proctoring Onboarding</span>
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
                    <div className={`absolute size-[160px] rounded-full border-2 border-dashed transition-all duration-300 ${faceAligned ? "border-emerald-500 bg-emerald-500/5 shadow-[0_0_20px_rgba(16,185,129,0.3)]" : "border-[#c5af8a]/60 animate-pulse"}`}>
                      {/* Scanning vertical line */}
                      {!faceAligned && (
                        <div className="w-full h-0.5 bg-[#c5af8a] shadow-[0_0_8px_#c5af8a] absolute top-0 animate-[scan_2s_infinite_ease-in-out]" />
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
                      : "Scanning for face alignment..."}
                  </span>
                  {!capturedPhoto && (
                    <span className="font-mono text-[10px] text-zinc-450">{detectionProgress}%</span>
                  )}
                </div>
                {!capturedPhoto && (
                  <div className="h-1.5 w-full bg-zinc-900 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-[#c5af8a] to-emerald-500 transition-all duration-200" 
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
                    className="flex-1 bg-[#c5af8a] hover:bg-[#b09b77] disabled:opacity-40 disabled:hover:bg-[#c5af8a] text-zinc-950 py-3 rounded-xl text-xs font-bold transition cursor-pointer shadow-md"
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
          <div className="flex-1 flex items-center justify-center p-4">
            <div className="max-w-[540px] w-full rounded-3xl bg-[#242220] border border-zinc-800 p-8 space-y-6 shadow-2xl relative overflow-hidden">
              <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-[#c5af8a]/60 to-transparent" />

              <div className="text-center space-y-2">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#c5af8a]/10 border border-[#c5af8a]/20 text-[#c5af8a] text-[10px] font-extrabold uppercase tracking-wider">
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
                <div className="absolute size-44 rounded-full border-2 border-dashed border-[#c5af8a]/60 flex items-center justify-center pointer-events-none">
                  <div className="size-24 rounded-full border border-[#c5af8a]/40" />
                  <div className={`size-2.5 rounded-full ${isCalibrated ? "bg-emerald-400 shadow-[0_0_12px_#10b981]" : "bg-[#c5af8a] animate-ping"}`} />
                </div>

                {/* Live countdown overlay while calibrating */}
                {isCalibrating && (
                  <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center gap-2">
                    <span className="text-5xl font-extrabold text-[#c5af8a] font-mono tracking-wider animate-pulse">
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

              <div className="bg-[#2a2825] border border-zinc-700/50 rounded-xl p-4 text-xs text-zinc-300 space-y-1.5">
                <span className="font-bold text-[#c5af8a] flex items-center gap-1.5">
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
                    className="w-full bg-[#c5af8a] hover:bg-[#b09b77] disabled:opacity-50 text-zinc-950 py-3 rounded-xl text-xs font-bold transition cursor-pointer shadow-md flex items-center justify-center gap-2"
                  >
                    <Activity className="size-4" />
                    {isCalibrating ? `Calibrating (${calibrationCountdown}s remaining)...` : "Start 3-Second Calibration"}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={finalizeOnboardingAndStartExam}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-3.5 rounded-xl text-xs font-extrabold transition cursor-pointer shadow-lg shadow-emerald-950/40 flex items-center justify-center gap-2"
                  >
                    <Play className="size-4 fill-current" /> Begin Secure Examination
                  </button>
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
                  <button
                    type="button"
                    onClick={finalizeOnboardingAndStartExam}
                    className="text-zinc-500 hover:text-zinc-400 text-[11px] underline bg-transparent border-none cursor-pointer"
                  >
                    Skip calibration (Use center default)
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="max-w-[480px] w-full rounded-3xl bg-[#242220] border border-zinc-800 p-8 space-y-6 shadow-2xl">
            <div className="text-center space-y-2">
              <span className="text-[10px] font-bold text-[#c5af8a] uppercase tracking-wider">IntegrityOS System Check</span>
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

            <div className="rounded-xl bg-[#2a2825] border border-zinc-700/50 p-4 space-y-2">
              <span className="text-xs font-bold text-[#c5af8a] flex items-center gap-1.5">
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
                  className="flex-1 bg-[#c5af8a] hover:bg-[#b09b77] text-zinc-950 py-3 rounded-xl text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5"
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
        /* 2. SECURE EXAM ROOM ENVIRONMENT */
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
          
          {/* Floating Beige Proctor HUD Widget */}
          <div className="fixed top-4 right-4 z-50 bg-[#F2EBD9] text-[#1a1917] border border-[#d5cbb8] rounded-2xl p-4 shadow-xl flex items-center gap-3.5 w-80 select-none">
            {/* Profile Photo */}
            <div className="size-14 rounded-xl border border-[#d5cbb8] overflow-hidden bg-zinc-200 shrink-0 shadow-inner">
              {capturedPhoto ? (
                <img src={capturedPhoto} className="w-full h-full object-cover" alt="Proctor Profile" />
              ) : (
                <div className="size-full flex items-center justify-center bg-zinc-300 text-zinc-600 font-bold">👤</div>
              )}
            </div>
            <div className="flex-1 min-w-0 text-xs text-[#242220]">
              <span className="text-[9px] font-extrabold text-[#91764c] uppercase tracking-wider block mb-0.5">Active Proctor HUD</span>
              <p className="font-extrabold text-sm text-[#1c1b1b] truncate">{user.name}</p>
              <p className="text-[10px] text-zinc-500 font-mono mt-0.5">Exam ID: {assessmentId}</p>
              <div className="flex items-center gap-1.5 mt-2 font-extrabold text-zinc-900 bg-black/5 px-2 py-1 rounded-lg w-fit">
                <Clock className="size-3.5 text-[#91764c]" />
                <span className="font-mono tracking-wide">{formatTime(timeLeft)} left</span>
              </div>
            </div>
          </div>

          {/* Main workspace section (Left/Center) */}
          <div className="flex-1 flex flex-col justify-between overflow-y-auto p-6 md:p-8 md:pr-14">
            
            {/* Header banner inside Exam room */}
            <div className="flex items-center justify-between border-b border-zinc-800 pb-4 mb-6">
              <div>
                <h3 className="text-lg font-bold">{assessment.title}</h3>
                <span className="text-[11px] text-zinc-400">SRM University AP • Candidate: {user.name}</span>
              </div>
              <div className="bg-[#242220] border border-zinc-800 rounded-xl px-4 py-2 flex items-center gap-2">
                <Clock className="size-4 text-[#c5af8a]" />
                <span className="text-sm font-extrabold font-mono tracking-widest text-[#c5af8a]">
                  {formatTime(timeLeft)}
                </span>
              </div>
            </div>

            {/* Current Active Question area */}
            {questions.length > 0 && (
              <div className="flex-1 flex flex-col justify-between max-w-3xl w-full mx-auto space-y-6">
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-zinc-400">
                      Question {activeIdx + 1} of {questions.length}
                    </span>
                    <span className="text-[11px] text-white bg-zinc-800 border rounded px-2.5 py-0.5 uppercase">
                      {questions[activeIdx].difficulty} • {questions[activeIdx].points} pts
                    </span>
                  </div>

                  {/* Question Prompt */}
                  <div className="bg-[#242220] border border-zinc-800 rounded-2xl p-6 shadow-md space-y-4">
                    <p className="text-[15px] leading-relaxed font-semibold">
                      {questions[activeIdx].text}
                    </p>
                    
                    {/* Mark for Review Button */}
                    <div className="flex justify-between items-center border-t border-zinc-800/80 pt-3 text-xs">
                      <span className="text-zinc-400">Flag this question if you want to review it later</span>
                      <button
                        key={`mark-${questions[activeIdx].id}`}
                        type="button"
                        onClick={() => {
                          const qId = questions[activeIdx].id;
                          let nextMarked = [...markedQuestions];
                          if (markedQuestions.includes(qId)) {
                            nextMarked = nextMarked.filter(id => id !== qId);
                          } else {
                            nextMarked.push(qId);
                          }
                          setMarkedQuestions(nextMarked);
                          saveStateToServer(answers, activeIdx, timeLeft, nextMarked, visitedQuestions);
                        }}
                        className={`px-3 py-1.5 rounded-lg border font-bold transition cursor-pointer ${
                          markedQuestions.includes(questions[activeIdx].id)
                            ? "bg-amber-600 border-amber-500 text-white"
                            : "border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                        }`}
                      >
                        {markedQuestions.includes(questions[activeIdx].id) ? "★ Marked for Review" : "☆ Mark for Review"}
                      </button>
                    </div>
                  </div>

                  {/* Answers input types matching questions format */}
                  <div className="space-y-3 pt-3">
                    {/* MCQ Options */}
                    {questions[activeIdx].type === "multiple-choice" && (
                      <div className="grid grid-cols-1 gap-2.5">
                        {JSON.parse(questions[activeIdx].options || "[]").map((opt: string, optIdx: number) => {
                          const isSelected = answers[questions[activeIdx].id] === opt;
                          return (
                            <button
                              key={optIdx}
                              type="button"
                              onClick={() => handleSelectOption(questions[activeIdx].id, opt)}
                              className={`w-full text-left p-4 rounded-xl border text-sm font-medium transition cursor-pointer flex items-center justify-between ${
                                isSelected
                                  ? "border-[#c5af8a] bg-[#c5af8a]/10 text-[#fffcf7]"
                                  : "border-zinc-800 bg-[#242220]/45 hover:bg-zinc-800/50"
                              }`}
                            >
                              <span>{String.fromCharCode(65 + optIdx)}: {opt}</span>
                              <span className={`size-4 rounded-full border flex items-center justify-center shrink-0 ${isSelected ? "border-[#c5af8a] bg-[#c5af8a]" : "border-zinc-700"}`}>
                                {isSelected && <span className="size-1.5 rounded-full bg-zinc-950" />}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* Descriptive answers */}
                    {questions[activeIdx].type === "descriptive" && (
                      <textarea
                        rows={6}
                        value={answers[questions[activeIdx].id] || ""}
                        onChange={(e) => handleTextChange(questions[activeIdx].id, e.target.value)}
                        placeholder="Write your explanation answer here..."
                        className="w-full bg-[#242220]/50 border border-zinc-800 rounded-xl p-4 text-sm font-normal focus:outline-none focus:border-[#c5af8a] focus:ring-1 focus:ring-[#c5af8a]"
                      />
                    )}

                    {/* Coding Editor Simulator Textarea */}
                    {questions[activeIdx].type === "coding" && (
                      <div className="space-y-1.5">
                        <textarea
                          rows={10}
                          value={answers[questions[activeIdx].id] || ""}
                          onChange={(e) => handleTextChange(questions[activeIdx].id, e.target.value)}
                          placeholder="// Write your code solution here (Python/Java/JavaScript syntax)..."
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-xs font-mono focus:outline-none focus:border-[#c5af8a] focus:ring-1 focus:ring-[#c5af8a] caret-white"
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer navigations */}
                <div className="flex justify-between items-center pt-6 border-t border-zinc-800 mt-6">
                  <button
                    type="button"
                    disabled={activeIdx === 0}
                    onClick={() => handleNavigateQuestion(activeIdx - 1)}
                    className="flex items-center gap-1.5 text-xs font-bold text-zinc-400 hover:text-white transition disabled:opacity-30 cursor-pointer"
                  >
                    <ChevronLeft className="size-4" /> Previous
                  </button>

                  {activeIdx < questions.length - 1 ? (
                    <button
                      type="button"
                      onClick={() => handleNavigateQuestion(activeIdx + 1)}
                      className="flex items-center gap-1.5 text-xs font-bold text-zinc-400 hover:text-white transition cursor-pointer"
                    >
                      Next Question <ChevronRight className="size-4" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleSubmit}
                      disabled={isSubmitting}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-5 py-2.5 rounded-xl shadow-lg transition cursor-pointer disabled:opacity-50"
                    >
                      {isSubmitting ? "Submitting..." : "Submit Examination"}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Secure Right Sidebar (Biometric logs & indicators) */}
          <aside className="w-full md:w-[280px] shrink-0 bg-[#242220] border-t md:border-t-0 md:border-l border-zinc-800 p-5 flex flex-col justify-between select-none">
            <div className="space-y-6">
              
              {/* Webcam stream check */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Integrity Video Stream</span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${cameraQuality?.usable !== false ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"}`}>
                    {cameraQuality ? `${Math.round(cameraQuality.qualityScore)}% Quality` : "Quality: Active"}
                  </span>
                </div>
                <div className="relative aspect-video rounded-xl bg-zinc-950 border border-zinc-800 overflow-hidden">
                  <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                  <div className="absolute top-2 left-2 size-2 rounded-full bg-emerald-500 animate-pulse" />
                  {currentPose && (
                    <div className="absolute bottom-1.5 left-2 bg-black/60 backdrop-blur-sm text-[9px] text-zinc-300 px-2 py-0.5 rounded font-mono">
                      Gaze: {currentPose.gazeDirection} ({currentPose.deltaYaw > 0 ? "+" : ""}{currentPose.deltaYaw?.toFixed(1) || 0}°)
                    </div>
                  )}
                </div>
              </div>

              {/* Status Indexes */}
              <div className="space-y-3.5">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Multi-Agent Shield Status</span>
                
                <div className="bg-zinc-900/60 rounded-xl p-3 border border-zinc-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="text-xs font-semibold text-zinc-300">Composite Integrity</span>
                    </div>
                    <span className={`text-xs font-extrabold ${integrityScore < 75 ? "text-amber-400" : "text-emerald-400"}`}>
                      {integrityScore}%
                    </span>
                  </div>

                  {/* 5-Dimension Mini Indicators */}
                  <div className="grid grid-cols-2 gap-1.5 pt-1 text-[10px] text-zinc-400 border-t border-zinc-800/60">
                    <div className="flex justify-between">
                      <span>Identity:</span>
                      <span className="font-bold text-zinc-200">{proctorMetrics?.identityScore ?? 100}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Camera:</span>
                      <span className="font-bold text-zinc-200">{cameraQuality ? `${Math.round(cameraQuality.qualityScore)}%` : "95%"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Environment:</span>
                      <span className="font-bold text-zinc-200">{proctorMetrics?.environmentScore ?? 100}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Behavior:</span>
                      <span className="font-bold text-zinc-200">{proctorMetrics?.behaviorScore ?? 100}%</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between bg-zinc-900/50 rounded-xl p-3 border border-zinc-800">
                  <span className="text-xs font-semibold text-zinc-300">Tab Switch Counter</span>
                  <span className={`text-xs font-bold ${tabSwitches > 2 ? "text-red-500" : "text-zinc-400"}`}>
                    {tabSwitches} / 3 Switches
                  </span>
                </div>
              </div>

              {/* Questions Checklist map */}
              <div className="space-y-2">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Questions Checklist</span>
                <div className="grid grid-cols-5 gap-2">
                  {questions.map((q, idx) => {
                    const isAnswered = answers[q.id] !== undefined;
                    const isActive = idx === activeIdx;
                    const isMarked = markedQuestions.includes(q.id);
                    return (
                      <button
                        key={q.id}
                        type="button"
                        onClick={() => handleNavigateQuestion(idx)}
                        className={`aspect-square rounded-lg flex items-center justify-center text-xs font-extrabold border transition cursor-pointer relative ${
                          isActive
                            ? "bg-[#c5af8a] text-zinc-950 border-[#c5af8a]"
                            : isMarked
                            ? "bg-amber-950/40 text-amber-300 border-amber-500"
                            : isAnswered
                            ? "bg-zinc-800 text-zinc-300 border-zinc-700"
                            : "bg-transparent text-zinc-500 border-zinc-800 hover:border-zinc-700"
                        }`}
                      >
                        {idx + 1}
                        {isMarked && <span className="absolute top-0.5 right-0.5 size-1.5 rounded-full bg-amber-500" />}
                      </button>
                    );
                  })}
                </div>
              </div>

            </div>

            {/* Help guidelines */}
            <div className="pt-5 border-t border-zinc-800 flex gap-2 text-zinc-500 text-[10px] items-center">
              <HelpCircle className="size-4 shrink-0" />
              <span>Need assistance? Use the portal help menu for proctor warnings.</span>
            </div>
          </aside>

        </div>
      )}
      {/* Real-time Exam Monitor Panel */}
      {examStarted && (
        <div className="fixed bottom-4 left-4 z-50 bg-[#242220]/90 border border-zinc-800 rounded-2xl p-4 shadow-2xl w-64 select-none backdrop-blur-md">
          <span className="text-[10px] font-bold text-[#c5af8a] uppercase tracking-wider block mb-2">Exam Monitor Panel</span>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-zinc-400">Camera</span>
              <span className="text-emerald-400 font-bold">✓ Active</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-zinc-400">Microphone</span>
              <span className="text-emerald-400 font-bold">✓ Active</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-zinc-400">Face Status</span>
              <span className={`font-bold ${faceStatus === "Detected" ? "text-emerald-400" : "text-rose-400"}`}>
                {faceStatus === "Detected" ? "✓ Detected" : faceStatus}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-zinc-400">Network</span>
              <span className="font-bold flex items-center gap-1.5">
                <span className={`size-2 rounded-full ${
                  networkStatus === "Excellent" ? "bg-emerald-500 animate-pulse" :
                  networkStatus === "Good" ? "bg-yellow-500 animate-pulse" :
                  networkStatus === "Slow" ? "bg-orange-500 animate-pulse" :
                  networkStatus === "Poor" ? "bg-red-500 animate-pulse" : "bg-zinc-500 animate-pulse"
                }`} />
                {networkStatus}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-zinc-400">Latency</span>
              <span className="font-mono">{latency} ms</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-zinc-400">Internet Connection</span>
              <span className={networkStatus === "Offline" ? "text-red-400 font-bold" : "text-emerald-400 font-bold"}>
                {networkStatus === "Offline" ? "Disconnected" : "Connected"}
              </span>
            </div>
            <div className="flex justify-between items-center border-t border-zinc-800/60 pt-1.5 mt-1.5">
              <span className="text-zinc-400">Tab Switches</span>
              <span className="font-semibold">{tabSwitches}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-zinc-400">Warnings logged</span>
              <span className="font-semibold text-amber-500">{warningsCount}</span>
            </div>
            <div className="flex justify-between items-center border-t border-zinc-800/60 pt-1.5 mt-1.5">
              <span className="text-zinc-400 font-bold">Integrity Score</span>
              <span className={`text-sm font-extrabold ${integrityScore < 70 ? "text-red-400" : "text-emerald-400"}`}>
                {integrityScore}%
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Look Away Warning Alert Popup */}
      {showLookAwayAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="max-w-[420px] w-full bg-[#242220] border-2 border-amber-500/80 rounded-3xl p-6 text-center space-y-4 shadow-2xl">
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
          <div className="max-w-[420px] w-full bg-[#242220] border-2 border-red-500/80 rounded-3xl p-6 text-center space-y-4 shadow-2xl">
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
          <div className="max-w-[420px] w-full bg-[#242220] border-2 border-amber-500/80 rounded-3xl p-6 text-center space-y-4 shadow-2xl">
            <Volume2 className="size-16 text-amber-500 mx-auto animate-pulse" />
            <h3 className="text-lg font-bold text-white">⚠ Background Noise Detected</h3>
            <p className="text-xs text-zinc-300 font-semibold">Background sounds are coming. Please move to a quieter environment.</p>
            <p className="text-xs text-zinc-450">Conversational volume or repeated background voices are flagged by the AI agent.</p>
            <button
              type="button"
              onClick={() => {
                setShowNoiseAlert(false);
                setBackgroundNoise("Quiet");
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
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-amber-600 text-white font-bold px-5 py-3 rounded-2xl shadow-xl flex items-center gap-3 max-w-md w-fit border border-amber-500 animate-in slide-in-from-top duration-300">
          <AlertTriangle className="size-5 shrink-0 animate-pulse" />
          <div className="text-xs text-left">
            <p className="font-extrabold text-sm">⚠ Network Connection is Slow</p>
            <p className="font-normal opacity-90 leading-tight mt-0.5">Your internet connection is unstable. Please avoid changing networks. Your answers continue to be saved automatically.</p>
          </div>
          <button 
            onClick={() => setShowSlowNetworkAlert(false)} 
            className="text-[10px] bg-white/20 hover:bg-white/35 px-2.5 py-1.5 rounded-lg shrink-0 font-bold uppercase transition"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Offline Loss of Connection Reconnect Overlay */}
      {networkStatus === "Offline" && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 backdrop-blur-md text-[#fffcf7] p-6 select-none animate-in fade-in duration-300">
          <div className="w-full max-w-sm bg-[#242220] border-2 border-red-500 rounded-3xl p-8 flex flex-col items-center gap-5 text-center shadow-2xl">
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
          <div className="max-w-[420px] w-full bg-[#242220] border border-zinc-800 rounded-3xl p-8 text-center space-y-5 shadow-2xl relative overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-[#c5af8a]/40 to-transparent" />
            <ShieldCheck className="size-16 text-[#c5af8a] mx-auto animate-pulse" />
            <h3 className="text-lg font-bold text-white">Resume Assessment</h3>
            <p className="text-xs text-zinc-300">An active assessment attempt was detected. Continue where you left off.</p>
            <p className="text-[11.5px] text-zinc-550 font-mono">Previous progress and answers have been successfully restored.</p>
            <button
              type="button"
              onClick={() => {
                setShowResumeModal(false);
                setExamStarted(true);
              }}
              className="w-full bg-[#c5af8a] hover:bg-[#b09b77] text-zinc-950 font-extrabold py-3 rounded-xl text-xs transition cursor-pointer shadow-md"
            >
              Resume Assessment
            </button>
          </div>
        </div>
      )}

      {/* Proctor Intervention Suspension Modal Overlay */}
      {isExamSuspended && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-md p-6 select-none animate-in fade-in duration-300">
          <div className="max-w-[460px] w-full bg-[#242220] border-2 border-red-500 rounded-3xl p-8 text-center space-y-5 shadow-2xl relative overflow-hidden">
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

      {showAnimation && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#faf9f6]/95 backdrop-blur-md text-[#1a1917] p-6 select-none animate-in fade-in duration-300">
          <div className="w-full max-w-md bg-white border-2 border-[#d3c2a6]/80 rounded-[32px] shadow-[0px_24px_48px_-8px_rgba(142,126,98,0.22)] p-8 md:p-10 flex flex-col items-center gap-6 relative overflow-hidden">
            <div className="absolute -top-[20%] -left-[20%] w-48 h-48 rounded-full bg-[#ebdcc9]/40 blur-3xl pointer-events-none" />

            <div className="relative flex items-center justify-center size-20">
              <svg className="size-full transform -rotate-90">
                <circle
                  cx="40"
                  cy="40"
                  r="36"
                  className="stroke-[#ebdcc9]/60"
                  strokeWidth="6"
                  fill="transparent"
                />
                <circle
                  cx="40"
                  cy="40"
                  r="36"
                  className="stroke-[#c5af8a] transition-all duration-500 ease-out"
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
              <p className="text-xs text-[#8e8a80] font-semibold">Please do not close your browser or navigate away</p>
            </div>

            <div className="w-full space-y-2.5 bg-[#faf9f5] border border-[#ebdcc9]/40 rounded-2xl p-4.5 max-h-56 overflow-y-auto">
              {SUBMISSION_STEPS.map((step, idx) => {
                const isCompleted = idx < currentStepIdx;
                const isActive = idx === currentStepIdx;
                const isPending = idx > currentStepIdx;

                return (
                  <div
                    key={idx}
                    className={`flex items-center gap-3 text-xs font-semibold transition-all duration-300 ${
                      isActive ? "text-[#1a1917] scale-105" : isCompleted ? "text-emerald-600" : "text-[#8e8a80]/50"
                    }`}
                  >
                    {isCompleted ? (
                      <span className="size-4.5 rounded-full bg-emerald-100 flex items-center justify-center text-[10px] font-bold text-emerald-600 shrink-0">✓</span>
                    ) : isActive ? (
                      <Loader2 className="size-4 animate-spin text-[#c5af8a] shrink-0" />
                    ) : (
                      <span className="size-4.5 rounded-full bg-[#ebdcc9]/20 flex items-center justify-center text-[9px] text-[#8e8a80]/30 shrink-0">•</span>
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
