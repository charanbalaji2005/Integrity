import React, { useState, useEffect, useRef } from "react";
import { AlertTriangle, UserPlus, Sparkles, ShieldAlert, Wrench, ScanFace, Activity, ShieldCheck } from "lucide-react";
import { Button } from "./components/ui/button";
import { Toaster } from "./components/ui/sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "./components/ui/dialog";

import { API_BASE_URL } from "./utils/api-client";
import { toast } from "sonner";
import { motion, useMotionValue, useSpring, useTransform, AnimatePresence, MotionConfig } from "motion/react";
import { SettingsCenter } from "./settings/SettingsCenter";
import { useApplyAppearance } from "./settings/useAppearance";

// Components

import { AuthBrandPanel } from "./components/AuthBrandPanel";
import { IntegrityGlobe, globeColor } from "./components/webgl/IntegrityGlobe";
import { AuthSuccessOverlay } from "./components/AuthSuccessOverlay";

// Pages/Views
import { LoginView } from "./pages/auth/LoginView";
import { FacultyLoginView } from "./pages/auth/FacultyLoginView";
import { ForgotPasswordEmailView } from "./pages/auth/ForgotPasswordEmailView";
import { VerifyOTPView } from "./pages/auth/VerifyOTPView";
import { ResetPasswordView } from "./pages/auth/ResetPasswordView";
import { RegisterView } from "./pages/auth/RegisterView";
import LinkCredentialsPage from "./pages/LinkCredentialsPage";
import IdentityVerificationPage from "./pages/IdentityVerificationPage";
import SecuritySetupPage from "./pages/SecuritySetupPage";
import { DashboardView } from "./pages/DashboardView";
import FacultyPortalView from "./pages/FacultyPortalView";
import StudentExamView from "./pages/StudentExamView";
import { AdminPanelView } from "../admin/AdminPanelView";
import { SupportLoginView } from "./pages/auth/SupportLoginView";
import { SupportRegisterView } from "./pages/auth/SupportRegisterView";
import { SupportDashboardView } from "./pages/SupportDashboardView";
import { AdminLoginView } from "../admin/AdminLoginView";
import { CookieConsent } from "./components/CookieConsent";
import { GoogleOneTap } from "./components/GoogleOneTap";
import { TermsAndConditionsView } from "./pages/TermsAndConditionsView";
import { PrivacyPolicyView } from "./pages/PrivacyPolicyView";
import { LandingView } from "./pages/LandingView";

// Notification and Profile Contexts
import { NotificationProvider } from "./context/NotificationContext";
import { ProfileProvider } from "./context/ProfileContext";
import { ProfileCenter } from "./components/ProfileCenter";

// Utility
function parseUserAgent(ua?: string) {
  if (!ua) return "Detecting...";
  let browser = "Browser";
  let os = "OS";

  const lowerUa = ua.toLowerCase();
  if (lowerUa.includes("firefox")) browser = "Firefox";
  else if (lowerUa.includes("chrome") || lowerUa.includes("crios")) browser = "Chrome";
  else if (lowerUa.includes("safari")) browser = "Safari";
  else if (lowerUa.includes("edge") || lowerUa.includes("edg")) browser = "Edge";

  if (lowerUa.includes("windows")) os = "Windows";
  else if (lowerUa.includes("macintosh") || lowerUa.includes("mac os")) os = "macOS";
  else if (lowerUa.includes("linux")) os = "Linux";
  else if (lowerUa.includes("android")) os = "Android";
  else if (lowerUa.includes("iphone") || lowerUa.includes("ipad") || lowerUa.includes("ipod")) os = "iOS";

  return `${browser} on ${os}`;
}

type PortalKind = "admin" | "faculty" | "support" | "student";

/** Role the notification feed should use for the portal on screen (admin alerts stay in the admin portal). */
const PORTAL_NOTIFICATION_ROLE: Record<PortalKind, string> = {
  admin: "admin",
  faculty: "faculty",
  support: "support",
  student: "user",
};

interface AuthorizedPortalWrapperProps {
  children: React.ReactNode;
  user: any;
  handleLogout: () => void;
  /** Which portal is being shown. An admin browsing another portal sees that portal's notifications. */
  portal: PortalKind;
}

const AuthorizedPortalWrapper: React.FC<AuthorizedPortalWrapperProps> = ({ children, user, handleLogout, portal }) => {
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  useEffect(() => {
    const handleOpenProfile = () => {
      setIsProfileOpen(true);
    };
    window.addEventListener("open-profile-drawer", handleOpenProfile);
    return () => {
      window.removeEventListener("open-profile-drawer", handleOpenProfile);
    };
  }, []);

  const reduceMotion = useApplyAppearance(user.id);

  return (
    <MotionConfig reducedMotion={reduceMotion ? "always" : "user"}>
      <NotificationProvider
        userId={user.id}
        userRole={user.role === "admin" ? PORTAL_NOTIFICATION_ROLE[portal] : user.role}
      >
        <ProfileProvider userId={user.id} userRole={user.role}>
          {children}
          <ProfileCenter
            isOpen={isProfileOpen}
            onClose={() => setIsProfileOpen(false)}
            handleLogout={handleLogout}
          />
          <SettingsCenter user={user} handleLogout={handleLogout} />
        </ProfileProvider>
      </NotificationProvider>
    </MotionConfig>
  );
};

const ambientParticles = [
  { size: 6, top: "15%", left: "10%", delay: 0, duration: 22 },
  { size: 8, top: "25%", left: "45%", delay: 2, duration: 28 },
  { size: 4, top: "60%", left: "20%", delay: 4, duration: 18 },
  { size: 10, top: "75%", left: "80%", delay: 1, duration: 32 },
  { size: 5, top: "40%", left: "85%", delay: 3, duration: 25 },
  { size: 7, top: "85%", left: "15%", delay: 5, duration: 30 },
  { size: 9, top: "10%", left: "70%", delay: 2, duration: 24 },
  { size: 5, top: "50%", left: "30%", delay: 6, duration: 20 },
];

function EmergencyShutdownScreen() {
  return (
    <div className="min-h-screen w-full bg-[#0a0505] text-[#fcdcdc] flex flex-col items-center justify-center p-6 relative overflow-hidden font-sans select-none">
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        <motion.div 
          className="absolute -top-[20%] -left-[20%] w-[80vw] h-[80vw] rounded-full bg-red-900/10 blur-[150px]"
          animate={{ scale: [1, 1.2, 1], x: [-30, 30, -30], y: [-20, 40, -20] }} 
          transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }} 
        />
        <motion.div 
          className="absolute -bottom-[30%] -right-[20%] w-[90vw] h-[90vw] rounded-full bg-rose-900/15 blur-[160px]"
          animate={{ scale: [1.1, 0.95, 1.1], x: [40, -40, 40], y: [20, -30, 20] }} 
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }} 
        />
      </div>

      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="w-full max-w-xl bg-red-950/20 backdrop-blur-xl border border-red-500/20 rounded-[32px] p-8 sm:p-12 shadow-[0_24px_50px_rgba(0,0,0,0.6)] z-10 flex flex-col items-center text-center relative overflow-hidden"
      >
        <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-red-500/40 to-transparent" />
        
        <div className="relative mb-6">
          <div className="absolute inset-0 rounded-full bg-red-500/20 blur-xl animate-pulse" />
          <div className="relative size-20 rounded-full bg-red-950/45 border border-red-500/30 flex items-center justify-center shadow-inner">
            <ShieldAlert className="size-10 text-red-500" />
          </div>
        </div>

        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight bg-gradient-to-b from-red-100 to-red-400 bg-clip-text text-transparent mb-4">
          SYSTEM SUSPENDED
        </h1>

        <p className="text-sm font-semibold uppercase tracking-widest text-red-400 mb-6">
          Emergency Shutdown Active
        </p>

        <p className="text-sm sm:text-base text-zinc-400 leading-relaxed mb-8">
          The Assessment Integrity Platform has been temporarily suspended by the system administrator for safety and security. All active student exams and faculty evaluations are safely locked.
        </p>

        <div className="w-full bg-red-950/30 rounded-2xl p-4 border border-red-500/10 text-xs text-zinc-400 font-mono flex items-center gap-3">
          <div className="size-2 rounded-full bg-red-500 animate-ping" />
          <span>Status Code: 503 SERVICE_UNAVAILABLE_EMERGENCY</span>
        </div>
        <a
          href="/?admin=true"
          className="mt-6 inline-block text-[11px] font-semibold text-zinc-500 hover:text-zinc-300 underline underline-offset-4"
        >
          Administrator sign-in
        </a>
      </motion.div>

      <span className="absolute bottom-6 text-[10px] font-bold text-zinc-600 uppercase tracking-widest z-10">
        IntegrityOS Security Core
      </span>
    </div>
  );
}

function MaintenanceScreen() {
  return (
    <div className="min-h-screen w-full bg-[#080808] text-[#f4f4f4] flex flex-col items-center justify-center p-6 relative overflow-hidden font-sans select-none">
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        <motion.div 
          className="absolute -top-[20%] -left-[20%] w-[80vw] h-[80vw] rounded-full bg-amber-900/10 blur-[150px]"
          animate={{ scale: [1, 1.25, 1], x: [-20, 20, -20], y: [-30, 30, -30] }} 
          transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }} 
        />
        <motion.div 
          className="absolute -bottom-[30%] -right-[20%] w-[90vw] h-[90vw] rounded-full bg-yellow-900/10 blur-[160px]"
          animate={{ scale: [1.1, 0.9, 1.1], x: [30, -30, 30], y: [30, -20, 30] }} 
          transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }} 
        />
      </div>

      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="w-full max-w-xl bg-amber-950/15 backdrop-blur-xl border border-amber-500/20 rounded-[32px] p-8 sm:p-12 shadow-[0_24px_50px_rgba(0,0,0,0.5)] z-10 flex flex-col items-center text-center relative overflow-hidden"
      >
        <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-amber-500/40 to-transparent" />
        
        <div className="relative mb-6">
          <div className="absolute inset-0 rounded-full bg-amber-500/15 blur-xl animate-pulse" />
          <div className="relative size-20 rounded-full bg-amber-950/45 border border-amber-500/20 flex items-center justify-center shadow-inner">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 12, ease: "linear" }}
            >
              <Wrench className="size-9 text-amber-500" />
            </motion.div>
          </div>
        </div>

        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight bg-gradient-to-b from-amber-100 to-amber-400 bg-clip-text text-transparent mb-4">
          SYSTEM MAINTENANCE
        </h1>

        <p className="text-sm font-semibold uppercase tracking-widest text-amber-400 mb-6">
          Scheduled Upgrades in Progress
        </p>

        <p className="text-sm sm:text-base text-zinc-400 leading-relaxed mb-8">
          The Assessment Integrity Platform is undergoing scheduled optimization and performance upgrades. The autonomous maintenance service is active. We will be back online shortly.
        </p>

        <div className="w-full bg-amber-950/30 rounded-2xl p-4 border border-amber-500/10 text-xs text-zinc-400 font-mono flex items-center gap-3">
          <div className="size-2 rounded-full bg-amber-500 animate-ping" />
          <span>Status Code: 503 SERVICE_UNAVAILABLE_MAINTENANCE</span>
        </div>
        <a
          href="/?admin=true"
          className="mt-6 inline-block text-[11px] font-semibold text-zinc-500 hover:text-zinc-300 underline underline-offset-4"
        >
          Administrator sign-in
        </a>
      </motion.div>

      <span className="absolute bottom-6 text-[10px] font-bold text-zinc-600 uppercase tracking-widest z-10">
        IntegrityOS Autonomous Maintenance
      </span>
    </div>
  );
}

const devLog = (...args: any[]) => {
  if (import.meta.env.DEV) {
    console.log(...args);
  }
};

export default function App() {
  const [showPassword, setShowPassword] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const [email, setEmail] = useState("charanbalajineelampalli752005@gmail.com");
  const [password, setPassword] = useState("752006");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [session, setSession] = useState<any>(null);
  const [clientInfo, setClientInfo] = useState<{ ip: string; userAgent: string } | null>(null);
  const [backendStatus, setBackendStatus] = useState<"checking" | "online" | "offline">("checking");
  const [showDomainPopup, setShowDomainPopup] = useState(false);
  const [registerRequiredModal, setRegisterRequiredModal] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date().toLocaleString());
  const [registrationRole, setRegistrationRole] = useState<"user" | "faculty">("user");
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [wantsAdmin, setWantsAdmin] = useState(false);
  const [isAdminPortal, setIsAdminPortal] = useState(false);
  const [currentPath, setCurrentPath] = useState(window.location.pathname);
  const [isSessionChecking, setIsSessionChecking] = useState(true);
  const [activeAssessmentId, setActiveAssessmentId] = useState<string | null>(null);
  const [isFacultyPortal, setIsFacultyPortal] = useState(false);
  const [isSupportPortal, setIsSupportPortal] = useState(false);
  const [view, setView] = useState<"login" | "register" | "google-register" | "link-credentials" | "identity-verification" | "security-setup" | "forgot-email" | "forgot-otp" | "forgot-reset" | "terms" | "privacy">("login");
  const [registrationEmail, setRegistrationEmail] = useState("");
  const [registrationPassword, setRegistrationPassword] = useState("");
  const [maintenanceActive, setMaintenanceActive] = useState(false);
  const [shutdownActive, setShutdownActive] = useState(false);
  const [studentPortalEnabled, setStudentPortalEnabled] = useState(true);
  const [facultyPortalEnabled, setFacultyPortalEnabled] = useState(true);
  const [adminPortalEnabled, setAdminPortalEnabled] = useState(true);

  // Auth success animation
  const [showAuthSuccess, setShowAuthSuccess] = useState(false);
  const [pendingAuthData, setPendingAuthData] = useState<{ user: any; session: any } | null>(null);

  // Login card shake on error
  const [loginShake, setLoginShake] = useState(false);

  const triggerLoginShake = () => {
    setLoginShake(true);
    setTimeout(() => setLoginShake(false), 700);
  };

  const handleAuthAnimationComplete = () => {
    if (pendingAuthData) {
      setUser(pendingAuthData.user);
      setSession(pendingAuthData.session);
      setPendingAuthData(null);
    }
    setShowAuthSuccess(false);
  };

  const navigate = (to: string) => {
    window.history.pushState({}, "", to);
    setCurrentPath(window.location.pathname);
  };

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (currentPath === "/faculty-login") {
      setIsFacultyPortal(true);
      setIsSupportPortal(false);
    } else if (currentPath === "/support-login" || currentPath === "/support-register") {
      setIsSupportPortal(true);
      setIsFacultyPortal(false);
    } else {
      setIsFacultyPortal(false);
      setIsSupportPortal(false);
    }
    // Landing-page "Get Started" deep link opens the existing registration view.
    if (currentPath === "/register") {
      setView("register");
    }
  }, [currentPath]);

  useEffect(() => {
    const handleUrlParams = () => {
      const params = new URLSearchParams(window.location.search);
      const viewParam = params.get("view");
      if (viewParam === "terms") {
        setView("terms");
      } else if (viewParam === "privacy") {
        setView("privacy");
      }
    };
    handleUrlParams();
    window.addEventListener("popstate", handleUrlParams);
    return () => window.removeEventListener("popstate", handleUrlParams);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleString('en-US', {
        hour12: true,
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);



  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("admin") === "true" || params.get("portal") === "admin" || params.get("console") === "true") {
      setIsAdminPortal(true);
      setWantsAdmin(true);
    }
  }, []);

  useEffect(() => {
    if (wantsAdmin && user) {
      if (user.role === "admin") {
        setShowAdminPanel(true);
      } else {
        toast.info("Admin Console is restricted to administrators.");
      }
      setWantsAdmin(false);
      const cleanUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
      window.history.replaceState({ path: cleanUrl }, "", cleanUrl);
    }
  }, [wantsAdmin, user]);

  // Enforce admin role in the Admin Portal view
  useEffect(() => {
    if (user && isAdminPortal && user.role !== "admin") {
      toast.error("Access Denied: Non-administrative accounts are restricted from the Admin Portal.");
      handleLogout();
    }
  }, [user, isAdminPortal]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const errorParam = params.get("error");
    if (errorParam) {
      const decodedError = decodeURIComponent(errorParam);
      const oauthMessages: Record<string, string> = {
        state_mismatch: "Google sign-in couldn't be verified (the sign-in session expired or cookies were blocked). Please try again.",
        please_restart_the_process: "Google sign-in timed out. Please try again.",
        invalid_code: "Google sign-in expired before it finished. Please try again.",
        access_denied: "Google sign-in was cancelled.",
        oauth_session_missing: "Signed in with Google, but the session didn't reach this page. Please try again.",
        google_unavailable: "Google sign-in is unavailable right now. Please try again or use email and password.",
        unable_to_create_user: "Your Google account couldn't be linked. Use your institutional email, or register with email and password first.",
        account_not_linked: "This email is registered with a password. Sign in with your password, then link Google from your profile.",
      };
      if (decodedError.includes("email_not_registered:")) {
        toast.error("Google Sign-In is restricted to pre-registered accounts. Please register with email and password first.");
      } else if (oauthMessages[decodedError]) {
        toast.error(oauthMessages[decodedError]);
      } else {
        toast.error(`Sign-in failed: ${decodedError.replace(/_/g, " ")}`);
      }
      const cleanUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
      window.history.replaceState({ path: cleanUrl }, "", cleanUrl);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tokenParam = params.get("token");
    if (tokenParam) {
      setResetToken(tokenParam);
      setView("forgot-reset");
      const cleanUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
      window.history.replaceState({ path: cleanUrl }, "", cleanUrl);
    }
  }, []);

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const res = await fetch(
  `${API_BASE_URL}/api/health`
);
        if (res.ok) {
          const data = await res.json();
          setBackendStatus("online");
          if (data && data.client) {
            setClientInfo(data.client);
          }
          setMaintenanceActive(!!data.maintenanceMode);
          setShutdownActive(!!data.emergencyShutdown);
          setStudentPortalEnabled(data.studentPortalEnabled !== undefined ? !!data.studentPortalEnabled : true);
          setFacultyPortalEnabled(data.facultyPortalEnabled !== undefined ? !!data.facultyPortalEnabled : true);
          setAdminPortalEnabled(data.adminPortalEnabled !== undefined ? !!data.adminPortalEnabled : true);
        } else {
          setBackendStatus("offline");
        }
      } catch (err) {
        setBackendStatus("offline");
      }
    };
    checkHealth();
    const interval = setInterval(checkHealth, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const originalFetch = window.fetch;
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      try {
        const token = localStorage.getItem("auth_token");
        const options: RequestInit = { ...init };
        let urlStr = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
        let finalInput = input;

        if (urlStr.startsWith("/api")) {
          const fullUrl = `${API_BASE_URL}${urlStr}`;
          if (typeof input === "string") {
            finalInput = fullUrl;
          } else if (input instanceof URL) {
            finalInput = new URL(fullUrl);
          } else if (input instanceof Request) {
            finalInput = new Request(fullUrl, input);
          }
          urlStr = fullUrl;
        }

        // Auto-attach credentials and Bearer token for API endpoints
        if (urlStr.startsWith("/api") || (API_BASE_URL && urlStr.startsWith(API_BASE_URL))) {
          options.credentials = options.credentials || "include";
          if (token) {
            const headers = new Headers(options.headers || (input instanceof Request ? input.headers : {}));
            if (!headers.has("Authorization")) {
              headers.set("Authorization", `Bearer ${token}`);
            }
            options.headers = headers;
          }
        }

        const res = await originalFetch(finalInput, options);
        if (res.status === 503) {
          try {
            const clone = res.clone();
            const data = await clone.json();
            if (data.status === "EMERGENCY_SHUTDOWN") {
              setShutdownActive(true);
            } else if (data.status === "MAINTENANCE_MODE") {
              setMaintenanceActive(true);
            }
          } catch (e) {
            // ignore
          }
        }
        return res;
      } catch (err) {
        throw err;
      }
    };
    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  const sessionChecked = useRef(false);

  const checkSession = async () => {
    try {
      devLog("Executing checkSession...");
      const token = localStorage.getItem("auth_token");
      const headers: Record<string, string> = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
      const res = await fetch(`${API_BASE_URL}/api/auth/get-session`, {
        credentials: "include",
        headers,
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.user) {
          const updatedUser = { ...data.user };
          const actualRole = updatedUser.role || "user";
          const storedActiveRole = localStorage.getItem("activeRole");
          const newActiveRole = storedActiveRole || (actualRole === "user" ? "student" : actualRole);
          localStorage.setItem("activeRole", newActiveRole);

          setUser(updatedUser);
          setSession(data.session);
        } else {
          setUser(null);
          setSession(null);
        }
      } else {
        setUser(null);
        setSession(null);
      }
    } catch (err) {
      devLog("Failed to check active session:", err);
      setUser(null);
      setSession(null);
    } finally {
      setIsSessionChecking(false);
    }
  };

  useEffect(() => {
    if (sessionChecked.current) return;
    sessionChecked.current = true;

    // Google OAuth handoff: backend redirects here with #auth_token=<token>.
    // Store it (sent as a Bearer token on every API call) and strip it from the URL.
    const hashMatch = window.location.hash.match(/auth_token=([^&]+)/);
    if (hashMatch) {
      localStorage.setItem("auth_token", decodeURIComponent(hashMatch[1]));
      sessionStorage.removeItem("google_one_tap_dismissed");
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }

    checkSession();
  }, []);

  useEffect(() => {
    devLog("App Redirect useEffect triggered:", { currentPath, view, user: user ? { email: user.email, role: user.role } : null, isSessionChecking });
    if (isSessionChecking) return;

    if (user) {
      const activeRole = localStorage.getItem("activeRole") || user.role;
      if (user.role === "admin" && activeRole === "admin") {
        if (currentPath !== "/admin") {
          devLog("Redirecting Admin to /admin");
          navigate("/admin");
        }
      } else if (user.role === "support" || (user.role === "admin" && activeRole === "support")) {
        if (currentPath !== "/dashboard") {
          devLog("Navigating support agent to /dashboard");
          navigate("/dashboard");
        }
      } else if (user.role === "faculty" || (user.role === "admin" && activeRole === "faculty")) {
        if (currentPath !== "/dashboard") {
          devLog("Navigating faculty to /dashboard");
          navigate("/dashboard");
        }
      } else {
        const isAcademicSetupIncomplete = !user.institutionName || !user.department || !user.academicId;
        const isIdentitySetupIncomplete = !user.image;
        devLog("User setup status:", { isAcademicSetupIncomplete, isIdentitySetupIncomplete });
        if (isAcademicSetupIncomplete) {
          if (view !== "link-credentials" && view !== "identity-verification" && view !== "security-setup") {
            devLog("Setting view to link-credentials");
            setRegistrationEmail(user.email);
            setView("link-credentials");
          }
          if (currentPath !== "/login" && currentPath !== "/faculty-login" && currentPath !== "/support-login") {
            devLog("Navigating setup user to login path");
            navigate(isFacultyPortal ? "/faculty-login" : "/login");
          }
        } else if (isIdentitySetupIncomplete) {
          if (view !== "identity-verification" && view !== "security-setup") {
            devLog("Setting view to identity-verification");
            setView("identity-verification");
          }
          if (currentPath !== "/login" && currentPath !== "/faculty-login" && currentPath !== "/support-login") {
            devLog("Navigating setup user to login path");
            navigate(isFacultyPortal ? "/faculty-login" : "/login");
          }
        } else {
          if (currentPath === "/" || currentPath === "/link" || currentPath === "/login" || currentPath === "/faculty-login" || currentPath === "/support-login") {
            devLog("Navigating completed user to /dashboard");
            navigate("/dashboard");
          }
        }
      }
    } else {
      if (currentPath === "/dashboard" || currentPath === "/admin") {
        devLog("Navigating unauthenticated user to login path");
        if (isSupportPortal) {
          navigate("/support-login");
        } else if (isFacultyPortal) {
          navigate("/faculty-login");
        } else {
          navigate("/login");
        }
      }
    }
  }, [user, currentPath, isSessionChecking, view, isFacultyPortal, isSupportPortal]);

  useEffect(() => {
    if (user) {
      const loginTime = new Date().toLocaleString('en-US', {
        hour12: true,
        hour: 'numeric',
        minute: 'numeric',
        month: 'short',
        day: 'numeric'
      });
      const deviceName = parseUserAgent(navigator.userAgent);
      localStorage.setItem("lastLoginTime", loginTime);
      localStorage.setItem("lastLoginDevice", deviceName);
    }
  }, [user]);

  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotEmailTouched, setForgotEmailTouched] = useState(false);
  const [isSendingOtp, setIsSendingOtp] = useState(false);

  const [otp, setOtp] = useState<string[]>(Array(6).fill(""));
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [otpTimer, setOtpTimer] = useState(119);
  const [resendCooldown, setResendCooldown] = useState(30);
  const [otpError, setOtpError] = useState(false);
  const [otpSuccess, setOtpSuccess] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [newPasswordError, setNewPasswordError] = useState(false);
  const [confirmPasswordError, setConfirmPasswordError] = useState(false);
  const [resetCompleted, setResetCompleted] = useState(false);

  useEffect(() => {
    if (view !== "forgot-otp" || otpSuccess) return;
    const timer = setInterval(() => {
      setOtpTimer((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [view, otpSuccess]);

  useEffect(() => {
    if (view !== "forgot-otp" || resendCooldown <= 0 || otpSuccess) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [view, resendCooldown, otpSuccess]);

  const handleSendOTP = async () => {
    const normalized = forgotEmail.toLowerCase();
    const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
    if (!isEmailValid) {
      setForgotEmailTouched(true);
      return;
    }
    setIsSendingOtp(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/authentication/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalized }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Failed to initiate password reset");
      toast.success("Password reset link sent to your email!");
      setOtp(Array(6).fill(""));
      setOtpTimer(119);
      setResendCooldown(30);
      setOtpError(false);
      setOtpSuccess(false);
      setView("forgot-otp");
      setTimeout(() => otpRefs.current[0]?.focus(), 100);
    } catch (err: any) {
      toast.error(err.message || "Connection failed.");
    } finally {
      setIsSendingOtp(false);
    }
  };

  const handleOtpChange = (value: string, index: number) => {
    const cleanValue = value.replace(/\D/g, "");
    const newOtp = [...otp];
    newOtp[index] = cleanValue.slice(-1);
    setOtp(newOtp);
    if (cleanValue && index < 5) otpRefs.current[index + 1]?.focus();
  };

  const handleOtpKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) otpRefs.current[index - 1]?.focus();
  };

  const handleOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasteData = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    const newOtp = [...otp];
    for (let j = 0; j < pasteData.length; j++) newOtp[j] = pasteData[j];
    setOtp(newOtp);
    const focusIndex = Math.min(pasteData.length, 5);
    otpRefs.current[focusIndex]?.focus();
  };

  const handleVerifyOTP = async () => {
    const enteredCode = otp.join("");
    if (enteredCode.length < 6) {
      setOtpError(true);
      setTimeout(() => setOtpError(false), 400);
      return;
    }
    setIsVerifyingOtp(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/authentication/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: forgotEmail,
          otp: enteredCode,
        }),
      });
      const resData = await response.json();
      if (!response.ok) {
        throw new Error(resData?.message || "Invalid OTP code.");
      }

      setOtpSuccess(true);
      setResetToken(resData.data.token);
      setTimeout(() => {
        setView("forgot-reset");
      }, 2000);
    } catch (err: any) {
      setOtpError(true);
      setOtp(Array(6).fill(""));
      otpRefs.current[0]?.focus();
      toast.error(err.message || "Invalid verification code.");
      setTimeout(() => setOtpError(false), 2000);
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  const handleResendOtp = () => {
    handleSendOTP();
  };

  const handleResetPassword = async () => {
    let hasError = false;
    if (newPassword.length < 12) { setNewPasswordError(true); hasError = true; }
    if (newPassword !== confirmPassword || !confirmPassword) { setConfirmPasswordError(true); hasError = true; }
    if (hasError) {
      setTimeout(() => { setNewPasswordError(false); setConfirmPasswordError(false); }, 2000);
      return;
    }

    if (!resetToken) {
      toast.error("Reset token is missing or invalid. Please request a new link.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newPassword,
          token: resetToken,
        }),
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData?.message || "Failed to reset password. The link may have expired.");
      }
      setResetCompleted(true);
      toast.success("Password reset successfully!");
    } catch (err: any) {
      toast.error(err.message || "An error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBackToLogin = () => {
    setView("login");
    setForgotEmail("");
    setForgotEmailTouched(false);
    setOtp(Array(6).fill(""));
    setNewPassword("");
    setConfirmPassword("");
    setResetCompleted(false);
    setResetToken(null);
    setShowAdminPanel(false);
  };

  const handleLogin = async () => {
    if (!email || !password) {
      toast.error("Please enter email and password");
      return;
    }
    const normalized = email.toLowerCase();
    const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
    if (!isValidEmail) {
      toast.error("Please enter a valid email address.");
      return;
    }
    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/authentication/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email,
          password,
          portal: isAdminPortal ? "admin" : isSupportPortal ? "support" : isFacultyPortal ? "faculty" : "student",
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Invalid email or password");

      const actualRole = data.data.user?.role || "user";

      // Enforce portal-specific access controls based strictly on database role
      if (isFacultyPortal && actualRole !== "faculty" && actualRole !== "admin") {
        triggerLoginShake();
        toast.error("Access Denied: You do not have faculty privileges. Please log in through the Student Portal.");
        setIsSubmitting(false);
        return;
      }

      if (isSupportPortal && actualRole !== "support" && actualRole !== "admin") {
        triggerLoginShake();
        toast.error("Access Denied: You do not have support representative privileges.");
        setIsSubmitting(false);
        return;
      }

      // Store session token in localStorage for Bearer authorization fallback
      if (data.data.session?.token) {
        localStorage.setItem("auth_token", data.data.session.token);
      }

      const updatedUser = { ...data.data.user };
      let activeRole = actualRole === "user" ? "student" : actualRole;
      if (isAdminPortal) {
        activeRole = "admin";
      } else if (isFacultyPortal) {
        activeRole = "faculty";
      } else if (isSupportPortal) {
        activeRole = "support";
      } else if (actualRole === "admin") {
        activeRole = "student";
      }
      localStorage.setItem("activeRole", activeRole);

      setPendingAuthData({ user: updatedUser, session: data.data.session });
      setShowAuthSuccess(true);
    } catch (err: any) {
      triggerLoginShake();
      toast.error(err.message || "Connection failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = async () => {
    // Revoke on the server via both the custom endpoint and Better Auth's own
    // sign-out (clears its partitioned __Secure- cookies). Run in parallel; a
    // failure in one must not leave the user signed in.
    const token = localStorage.getItem("auth_token");
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    await Promise.allSettled([
      fetch(`${API_BASE_URL}/api/authentication/logout`, { method: "POST", credentials: "include", headers }),
      fetch(`${API_BASE_URL}/api/auth/sign-out`, { method: "POST", credentials: "include", headers, body: "{}" }),
    ]);

    // Stop Google One Tap from silently signing the user straight back in.
    try {
      window.google?.accounts?.id?.disableAutoSelect?.();
      window.google?.accounts?.id?.cancel?.();
    } catch {
      // ignore
    }
    sessionStorage.setItem("google_one_tap_dismissed", "true");

    localStorage.removeItem("auth_token");
    localStorage.removeItem("activeRole");
    setUser(null);
    setSession(null);
    setEmail("charanbalajineelampalli752005@gmail.com");
    setPassword("752006");
    setPassword("");
    setView("login");
    setShowAdminPanel(false);
    toast.success("Logged out successfully");
  };

  // Handles Google OAuth sign-in AND sign-up.
  // Accepts an optional emailOverride so the detected card can pass the email directly.
  // Does NOT require email to be pre-filled — if blank, Google shows its own account picker.
  // Domain restriction (@srmap.edu.in) is enforced by the backend databaseHooks.
  const handleGoogleSignIn = async (emailOverride?: string) => {
    try {
      // Guard: if React passed a MouseEvent as first arg (onClick without arrow fn), ignore it
      const base = typeof emailOverride === "string" ? emailOverride : email;
      const normalized = base.trim().toLowerCase();

      setIsSubmitting(true);

      // Pre-save intended activeRole before redirection
      localStorage.setItem("activeRole", isSupportPortal ? "support" : isFacultyPortal ? "faculty" : "student");

      // Start Google sign-in as a full-page navigation to the backend (not fetch):
      // the OAuth state cookie is then first-party on the backend and is sent back
      // when Google returns. A cookie set from a cross-site fetch gets partitioned
      // or blocked (e.g. Brave, or Vercel <-> Render), which made the callback fail
      // with state_mismatch and dumped users on the landing page.
      // Google returns via the backend's oauth-complete step, which hands the
      // session token to this portal's login page; the redirect effect then routes
      // the user to their dashboard.
      const portalPath = isSupportPortal ? "/support-login" : isFacultyPortal ? "/faculty-login" : "/login";
      const params = new URLSearchParams({ redirect: `${window.location.origin}${portalPath}` });
      if (normalized) params.set("login_hint", normalized);
      window.location.assign(`${API_BASE_URL}/api/authentication/google?${params.toString()}`);
    } catch (err: any) {
      toast.error(err.message || "Google Sign-In failed");
      setIsSubmitting(false);
    }
  };

  const handleGoogleOneTapSignIn = async (idToken: string) => {
    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/sign-in/social`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "google",
          idToken: {
            token: idToken,
          },
        }),
        credentials: "include",
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Failed to sign in with Google One Tap");
      }

      if (data && data.user) {
        const actualRole = data.user.role || "user";
        const updatedUser = { ...data.user };
        const activeRole = actualRole === "user" ? "student" : actualRole;
        localStorage.setItem("activeRole", activeRole);

        if (data.session?.token) {
          localStorage.setItem("auth_token", data.session.token);
        }

        setUser(updatedUser);
        setSession(data.session);
        toast.success("Successfully logged in with Google!");
      } else {
        if (data.url) {
          window.location.href = data.url;
        } else {
          throw new Error("Invalid response from server");
        }
      }
    } catch (err: any) {
      const errMsg = err.message || "";
      if (errMsg.includes("email_not_registered:")) {
        toast.error("Google login is only allowed for pre-registered accounts. Please register using email and password first.");
      } else {
        toast.error(errMsg || "Google One Tap login failed");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const springConfig = { damping: 26, stiffness: 120, mass: 0.6 };
  const smoothX = useSpring(mouseX, springConfig);
  const smoothY = useSpring(mouseY, springConfig);

  const cardRotateX = useTransform(smoothY, [-1, 1], [6, -6]);
  const cardRotateY = useTransform(smoothX, [-1, 1], [-6, 6]);
  const cardTranslateX = useTransform(smoothX, [-1, 1], [-15, 15]);
  const cardTranslateY = useTransform(smoothY, [-1, 1], [-15, 15]);
  const aiTranslateX = useTransform(smoothX, [-1, 1], [-6, 6]);
  const aiTranslateY = useTransform(smoothY, [-1, 1], [-6, 6]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const { left, top, width, height } = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - left) / width) * 2 - 1;
    const y = ((e.clientY - top) / height) * 2 - 1;
    mouseX.set(x); mouseY.set(y);
  };



  if (isSessionChecking) {
    return (
      <div className="min-h-screen w-full bg-[#080808] text-[#f8f8f8] flex flex-col items-center justify-center p-6 relative overflow-hidden font-sans select-none">
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
          <motion.div 
            className="absolute -top-[20%] -left-[20%] w-[80vw] h-[80vw] rounded-full bg-[#dedede]/5 blur-[150px]"
            animate={{ scale: [1, 1.15, 1], x: [-20, 20, -20], y: [-20, 20, -20] }} 
            transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }} 
          />
        </div>
        
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8 }}
          className="flex flex-col items-center text-center z-10"
        >
          {/* Logo or Icon animation */}
          <div className="relative mb-8">
            <div className="absolute inset-0 rounded-full bg-[#dedede]/10 blur-xl animate-pulse" />
            <motion.div 
              className="relative size-24 rounded-full bg-[#121212] border border-[#dedede]/25 flex items-center justify-center shadow-[0_0_50px_rgba(222,222,222,0.05)]"
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 8, ease: "linear" }}
            >
              <Sparkles className="size-10 text-[#dedede]" />
            </motion.div>
          </div>

          <h2 className="text-2xl font-extrabold tracking-tight bg-gradient-to-b from-[#f8f8f8] to-[#b2b2b2] bg-clip-text text-transparent mb-2">
            IntegrityOS Security Core
          </h2>
          <p className="text-xs uppercase tracking-widest text-[#8a8a8a] font-semibold animate-pulse">
            Verifying Active Session...
          </p>
        </motion.div>

        <span className="absolute bottom-6 text-[10px] font-bold text-[#5a5a5a] uppercase tracking-widest z-10">
          Loading Security Policies
        </span>
      </div>
    );
  }

  const isAdmin = user?.role === "admin";
  const isFaculty = user?.role === "faculty";
  const isStudent = user?.role === "user" || user?.role === "student" || !user;

  let shouldBlock = false;
  if (shutdownActive) {
    shouldBlock = !isAdmin && !isAdminPortal && currentPath !== "/admin";
  } else if (maintenanceActive) {
    if (!isAdmin && !isAdminPortal && currentPath !== "/admin") {
      shouldBlock = true;
    }
  }

  if (shouldBlock) {
    if (shutdownActive) {
      return <EmergencyShutdownScreen />;
    } else {
      return <MaintenanceScreen />;
    }
  }

  if (currentPath === "/dashboard" && user && !isAdminPortal) {
    if (activeAssessmentId) {
      return (
        <StudentExamView
          assessmentId={activeAssessmentId}
          user={user}
          onClose={() => {
            setActiveAssessmentId(null);
            // Quick state reload
            window.location.reload();
          }}
        />
      );
    }

    const activeRole = localStorage.getItem("activeRole") || user.role;
    if (user.role === "faculty" || (user.role === "admin" && activeRole === "faculty")) {
      return (
        <AuthorizedPortalWrapper user={user} handleLogout={handleLogout} portal="faculty">
          <FacultyPortalView
            user={user}
            session={session}
            handleLogout={handleLogout}
          />
        </AuthorizedPortalWrapper>
      );
    }

    if (user.role === "support" || (user.role === "admin" && activeRole === "support")) {
      return (
        <AuthorizedPortalWrapper user={user} handleLogout={handleLogout} portal="support">
          <SupportDashboardView
            user={user}
            session={session}
            handleLogout={handleLogout}
          />
        </AuthorizedPortalWrapper>
      );
    }

    return (
      <AuthorizedPortalWrapper user={user} handleLogout={handleLogout} portal="student">
        <DashboardView
          user={user}
          session={session}
          clientInfo={clientInfo}
          handleLogout={handleLogout}
          parseUserAgent={parseUserAgent}
          onStartAssessment={setActiveAssessmentId}
        />
      </AuthorizedPortalWrapper>
    );
  }

  if (currentPath === "/" || currentPath === "/link") {
    return <LandingView onNavigate={navigate} />;
  }

  if (view === "terms") {
    return (
      <AnimatePresence mode="wait">
        <TermsAndConditionsView key="terms" handleBackToLogin={handleBackToLogin} />
      </AnimatePresence>
    );
  }

  if (view === "privacy") {
    return (
      <AnimatePresence mode="wait">
        <PrivacyPolicyView key="privacy" handleBackToLogin={handleBackToLogin} />
      </AnimatePresence>
    );
  }

  if (view === "link-credentials") {
    return (
      <LinkCredentialsPage
        email={registrationEmail}
        initialRole={registrationRole}
        onBack={async () => {
          if (user) {
            await handleLogout();
          } else {
            setView("register");
          }
        }}
        onNext={() => setView("identity-verification")}
      />
    );
  }

  if (view === "identity-verification") {
    return (
      <IdentityVerificationPage
        user={user}
        onPrevious={() => setView("link-credentials")}
        onSkip={async () => {
          if (user) {
            try {
              await fetch(`${API_BASE_URL}/api/profile`, {
                method: "PUT",
                headers: {
                  "Content-Type": "application/json",
                  "x-user-id": user.id,
                  "x-user-role": user.role
                },
                body: JSON.stringify({
                  image: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
                  bypassFaceVerification: true
                })
              });
              await checkSession();
            } catch (err) {
              console.error("Failed to bypass face verification:", err);
            }
          }

          if (user?.role === "faculty") {
            setEmail(registrationEmail);
            setPassword(registrationPassword);
            setView("login");
            await checkSession();
          } else {
            setView("security-setup");
          }
        }}
        onContinue={async () => {
          if (user?.role === "faculty") {
            setEmail(registrationEmail);
            setPassword(registrationPassword);
            setView("login");
            await checkSession();
          } else {
            setView("security-setup");
          }
        }}
        onRefreshSession={checkSession}
      />
    );
  }

  if (view === "security-setup") {
    return (
      <SecuritySetupPage
        onBack={() => setView("identity-verification")}
        onFinish={async () => {
          if (user) {
            toast.success("Registration complete! Welcome to your dashboard.");
            navigate("/dashboard");
          } else {
            setEmail(registrationEmail);
            setPassword(registrationPassword);
            setView("login");
            toast.success("Registration complete! Please log in with your credentials.");
          }
        }}
      />
    );
  }

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => { mouseX.set(0); mouseY.set(0); }}
      className="relative flex min-h-[100dvh] w-full bg-background overflow-x-hidden selection:bg-[#e3e3e3] selection:text-[#1a1917]"
      style={{ pointerEvents: showAuthSuccess ? "none" : undefined }}
    >
      {/* Auth success overlay — renders above everything */}
      <AuthSuccessOverlay visible={showAuthSuccess} onComplete={handleAuthAnimationComplete} />
      {!user && <GoogleOneTap onSignInSuccess={handleGoogleOneTapSignIn} />}
      {/* Ambient background: soft light blobs + dot texture */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0" aria-hidden="true">
        <motion.div className="absolute -top-[10%] right-[-10%] w-[55vw] h-[55vw] rounded-full bg-[#dedede]/45 blur-[120px] motion-reduce:hidden" animate={{ scale: [1, 1.12, 1], x: [-15, 15, -15], y: [-10, 20, -10] }} transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }} />
        <motion.div className="absolute -bottom-[20%] -left-[10%] w-[50vw] h-[50vw] rounded-full bg-[#d9d9d9]/45 blur-[130px] motion-reduce:hidden" animate={{ scale: [1.1, 0.9, 1.1], x: [20, -20, 20], y: [10, -25, 10] }} transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }} />
        <div className="auth-dots absolute inset-0" />
        {ambientParticles.map((p, i) => (
          <motion.div key={i} className="absolute rounded-full bg-white/50 blur-[1.5px] motion-reduce:hidden" style={{ width: p.size, height: p.size, top: p.top, left: p.left }} animate={{ x: [0, 45, -35, 0], y: [0, -50, 40, 0], opacity: [0.25, 0.7, 0.25] }} transition={{ duration: p.duration, delay: p.delay, repeat: Infinity, ease: "easeInOut", times: [0, 0.33, 0.66, 1] }} />
        ))}
      </div>

      {!(user && isAdminPortal) && (
        <div className="relative z-10 hidden shrink-0 p-3 lg:block lg:w-[48%] xl:w-[52%] xl:p-4 2xl:max-w-[1000px]">
          <div className="sticky top-3 h-[calc(100dvh-24px)] xl:top-4 xl:h-[calc(100dvh-32px)]">
            <AuthBrandPanel parallaxX={aiTranslateX} parallaxY={aiTranslateY} />
          </div>
        </div>
      )}

      <div className={`relative flex flex-1 flex-col z-10 w-full min-w-0 overflow-x-hidden ${(user && isAdminPortal)
          ? "p-0 min-h-screen bg-white"
          : "items-center justify-start sm:justify-center px-4 pt-6 pb-10 sm:px-8 sm:py-12 lg:px-10 xl:px-16"
        }`}>
        {/* Compact WebGL banner for phones/tablets (the full brand panel is lg+ only) */}
        {!user && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            aria-hidden="true"
            className="relative mb-5 h-32 w-full max-w-[460px] overflow-hidden rounded-[22px] bg-[#111110] shadow-[0_20px_50px_-24px_rgba(17,17,16,0.6)] sm:mb-6 sm:h-40 lg:hidden"
          >
            <div className="absolute inset-0 bg-[radial-gradient(60%_80%_at_70%_50%,rgba(52,211,153,0.14),transparent)]" />
            <div className="absolute inset-y-0 right-[-8%] w-[70%]">
              <IntegrityGlobe base={globeColor("#f5f5f4")} accent={globeColor("#34d399")} points={1400} pointSize={2.1} interactive={false} />
            </div>
            <div className="absolute inset-y-0 left-5 flex flex-col justify-center sm:left-6">
              <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-white/45">IntegrityOS</span>
              <span className="mt-1 max-w-[11rem] text-[17px] font-semibold leading-tight tracking-[-0.02em] text-white sm:text-[19px]">
                Every exam, watched over.
              </span>
            </div>
          </motion.div>
        )}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={loginShake
            ? { x: [0, -10, 10, -8, 8, -5, 5, 0], opacity: 1, y: 0 }
            : { opacity: 1, y: 0, x: 0 }
          }
          transition={loginShake
            ? { duration: 0.55, ease: "easeInOut" }
            : { duration: 0.6, ease: [0.22, 1, 0.36, 1] }
          }
          className={`w-full ${(user && isAdminPortal)
              ? "max-w-none min-h-screen rounded-none border-0 shadow-none bg-white p-0 gap-0 overflow-hidden flex flex-col"
              : "relative max-w-[460px] overflow-hidden p-1 sm:rounded-[28px] sm:border sm:border-card-border/80 sm:bg-white/85 sm:p-10 sm:shadow-[0_1px_0_rgba(255,255,255,0.8)_inset,0_30px_60px_-20px_rgba(128,128,128,0.35),0_8px_20px_-12px_rgba(128,128,128,0.25)] sm:backdrop-blur-xl"
            } transition-[box-shadow,border-color] duration-500`}
        >
          {!(user && isAdminPortal) && (
            <span aria-hidden="true" className="pointer-events-none absolute inset-x-10 top-0 hidden h-px bg-gradient-to-r from-transparent via-tan-600/70 to-transparent sm:block" />
          )}
          <AnimatePresence mode="wait">
            {user ? (
              isAdminPortal ? (
                <AuthorizedPortalWrapper user={user} handleLogout={handleLogout} portal="admin">
                  <AdminPanelView key="admin" user={user} handleBack={handleLogout} parseUserAgent={parseUserAgent} />
                </AuthorizedPortalWrapper>
              ) : (
                <AuthorizedPortalWrapper user={user} handleLogout={handleLogout} portal="student">
                  <DashboardView key="dashboard" user={user} session={session} clientInfo={clientInfo} handleLogout={handleLogout} parseUserAgent={parseUserAgent} />
                </AuthorizedPortalWrapper>
              )
            ) : (
              <>
                {currentPath === "/support-login" ? (
                  <SupportLoginView
                    email={email}
                    setEmail={setEmail}
                    password={password}
                    setPassword={setPassword}
                    showPassword={showPassword}
                    setShowPassword={setShowPassword}
                    isSubmitting={isSubmitting}
                    backendStatus={backendStatus}
                    handleLogin={handleLogin}
                    handleGoogleSignIn={handleGoogleSignIn}
                    setView={setView}
                    onNavigate={navigate}
                  />
                ) : currentPath === "/support-register" ? (
                  <SupportRegisterView
                    setView={setView}
                    onNavigate={navigate}
                  />
                ) : (
                  <>
                    {view === "login" && (
                      isAdminPortal ? (
                        <AdminLoginView
                          handleLoginSuccess={(u, s) => {
                            setUser(u);
                            setSession(s);
                          }}
                          setIsAdminPortal={setIsAdminPortal}
                          backendStatus={backendStatus}
                          setView={setView}
                        />
                      ) : isFacultyPortal ? (
                        <FacultyLoginView
                          email={email}
                          setEmail={setEmail}
                          password={password}
                          setPassword={setPassword}
                          showPassword={showPassword}
                          setShowPassword={setShowPassword}
                          isSubmitting={isSubmitting}
                          backendStatus={backendStatus}
                          handleLogin={handleLogin}
                          handleGoogleSignIn={handleGoogleSignIn}
                          setView={setView}
                          clientInfo={clientInfo}
                          currentTime={currentTime}
                          parseUserAgent={parseUserAgent}
                          isAdminPortal={isAdminPortal}
                          setIsAdminPortal={setIsAdminPortal}
                          isFacultyPortal={isFacultyPortal}
                          setIsFacultyPortal={setIsFacultyPortal}
                          showDomainPopup={showDomainPopup}
                          onDismissDomainPopup={() => setShowDomainPopup(false)}
                          onNavigate={navigate}
                        />
                      ) : (
                        <LoginView
                          email={email}
                          setEmail={setEmail}
                          password={password}
                          setPassword={setPassword}
                          showPassword={showPassword}
                          setShowPassword={setShowPassword}
                          isSubmitting={isSubmitting}
                          backendStatus={backendStatus}
                          handleLogin={handleLogin}
                          handleGoogleSignIn={handleGoogleSignIn}
                          setView={setView}
                          clientInfo={clientInfo}
                          currentTime={currentTime}
                          parseUserAgent={parseUserAgent}
                          isAdminPortal={isAdminPortal}
                          setIsAdminPortal={setIsAdminPortal}
                          isFacultyPortal={isFacultyPortal}
                          setIsFacultyPortal={setIsFacultyPortal}
                          showDomainPopup={showDomainPopup}
                          onDismissDomainPopup={() => setShowDomainPopup(false)}
                        />
                      )
                    )}
                    {view === "register" && (
                      <RegisterView
                        setView={setView}
                        isFacultyPortal={isFacultyPortal}
                        onRegisterSuccess={(email, pass) => {
                          setRegistrationEmail(email);
                          setRegistrationPassword(pass);
                          setRegistrationRole(isFacultyPortal ? "faculty" : "user");
                          setView("link-credentials");
                        }}
                      />
                    )}
                    {view === "forgot-email" && (
                      <ForgotPasswordEmailView forgotEmail={forgotEmail} setForgotEmail={setForgotEmail} forgotEmailTouched={forgotEmailTouched} setForgotEmailTouched={setForgotEmailTouched} isSendingOtp={isSendingOtp} handleSendOTP={handleSendOTP} handleBackToLogin={handleBackToLogin} />
                    )}
                    {view === "forgot-otp" && (
                      <VerifyOTPView forgotEmail={forgotEmail} otp={otp} otpRefs={otpRefs} otpTimer={otpTimer} resendCooldown={resendCooldown} otpError={otpError} otpSuccess={otpSuccess} isVerifyingOtp={isVerifyingOtp} handleOtpChange={handleOtpChange} handleOtpKeyDown={handleOtpKeyDown} handleOtpPaste={handleOtpPaste} handleVerifyOTP={handleVerifyOTP} handleResendOtp={handleResendOtp} resetToEmail={() => setView("forgot-email")} />
                    )}
                    {view === "forgot-reset" && (
                      <ResetPasswordView 
                        newPassword={newPassword} 
                        setNewPassword={setNewPassword} 
                        confirmPassword={confirmPassword} 
                        setConfirmPassword={setConfirmPassword} 
                        newPasswordError={newPasswordError} 
                        confirmPasswordError={confirmPasswordError} 
                        resetCompleted={resetCompleted} 
                        handleResetPassword={handleResetPassword} 
                        handleBackToLogin={handleBackToLogin}
                        email={forgotEmail} 
                      />
                    )}
                  </>
                )}
              </>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Tablet-only trust strip (brand panel is hidden below lg) */}
        {!user && (
          <ul className="mt-6 hidden w-full max-w-[460px] grid-cols-3 gap-2 md:grid lg:hidden" aria-label="Platform capabilities">
            {[
              { icon: ScanFace, label: "Identity verified" },
              { icon: Activity, label: "Live monitoring" },
              { icon: ShieldCheck, label: "Evidence tracked" },
            ].map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center justify-center gap-1.5 rounded-xl border border-card-border/70 bg-white/60 px-2 py-2.5 text-xs font-medium text-ink-500 backdrop-blur">
                <Icon className="size-3.5 text-tan-700" aria-hidden="true" />
                {label}
              </li>
            ))}
          </ul>
        )}

        <div className="absolute bottom-6 right-6 pointer-events-none z-20 hidden lg:block" aria-hidden="true">
          <Sparkles className="size-8 text-white fill-white opacity-90" />
        </div>


        <Dialog open={!!registerRequiredModal} onOpenChange={(open) => !open && setRegisterRequiredModal(null)}>
          <DialogContent className="sm:max-w-[420px] rounded-[32px] border-2 border-[#c4c4c4]/30 bg-white p-8 shadow-2xl backdrop-blur-xl outline-none">
            <DialogHeader className="flex flex-col items-center gap-4 text-center">
              <div className="flex size-16 items-center justify-center rounded-full bg-[#ececec] border border-[#c4c4c4]/30">
                <UserPlus className="size-8 text-[#1e1e1e]" />
              </div>
              <DialogTitle className="text-2xl font-bold tracking-tight text-[#1a1917]">Account Not Found</DialogTitle>
              <DialogDescription className="text-base text-[#686868] leading-relaxed">The account <span className="font-bold text-[#1a1917]">{registerRequiredModal}</span> is not registered in our system. Please register first to enable Google Sign-In.</DialogDescription>
            </DialogHeader>
            <DialogFooter className="mt-6 flex flex-col gap-2">
              <Button onClick={() => { setRegisterRequiredModal(null); toast.info("Please use the registration form."); }} className="w-full h-12 rounded-xl bg-[#1e1e1e] text-white hover:bg-black font-bold transition-all shadow-lg active:scale-95">Go to Registration</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <CookieConsent />
        <Toaster />
      </div>
    </div>
  );
}
