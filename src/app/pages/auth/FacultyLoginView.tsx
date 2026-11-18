import React from "react";
import { GraduationCap, LifeBuoy, ShieldCheck, UserRound } from "lucide-react";
import { PortalLoginForm } from "./components/PortalLoginForm";

interface FacultyLoginViewProps {
  email: string;
  setEmail: (email: string) => void;
  password: string;
  setPassword: (password: string) => void;
  showPassword: boolean;
  setShowPassword: (show: boolean) => void;
  isSubmitting: boolean;
  backendStatus: "checking" | "online" | "offline";
  handleLogin: () => void;
  handleGoogleSignIn: (emailOverride?: string) => void;
  setView: (view: any) => void;
  clientInfo: { ip: string; userAgent: string } | null;
  currentTime: string;
  parseUserAgent: (ua?: string) => string;
  isAdminPortal?: boolean;
  setIsAdminPortal?: (val: boolean) => void;
  isFacultyPortal?: boolean;
  setIsFacultyPortal?: (val: boolean) => void;
  showDomainPopup?: boolean;
  onDismissDomainPopup?: () => void;
  onNavigate: (to: string) => void;
}

export function FacultyLoginView({
  isAdminPortal,
  setIsAdminPortal,
  setIsFacultyPortal,
  onNavigate,
  setView,
  ...rest
}: FacultyLoginViewProps) {
  return (
    <PortalLoginForm
      {...rest}
      setView={setView}
      viewKey="faculty-login"
      eyebrowIcon={GraduationCap}
      eyebrow="Faculty portal"
      title="Faculty sign in"
      description="Design assessments, monitor live proctoring and review attempts with AI-assisted grading."
      emailLabel="Instructor email"
      emailPlaceholder="charanbalajineelampalli752005@gmail.com"
      domainError={() => null}
      submitLabel="Sign in to Faculty Portal"
      onForgotPassword={() => setView("forgot-email")}
      notice={
        <>
          <span className="font-semibold text-ink-900">Faculty accounts</span> can't be self-registered. They're
          provisioned by institutional administrators — contact your university IT department for access.
        </>
      }
      portalLinks={[
        {
          label: "Student",
          icon: UserRound,
          onClick: () => {
            setIsFacultyPortal?.(false);
            onNavigate("/login");
          },
        },
        { label: "Support", icon: LifeBuoy, onClick: () => onNavigate("/support-login") },
        { label: "Admin", icon: ShieldCheck, onClick: () => setIsAdminPortal?.(!isAdminPortal) },
      ]}
    />
  );
}
