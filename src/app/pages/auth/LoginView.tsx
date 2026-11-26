import React from "react";
import { GraduationCap, LifeBuoy, ShieldCheck } from "lucide-react";
import { PortalLoginForm } from "./components/PortalLoginForm";
import { TextLink } from "./components/AuthPrimitives";

interface LoginViewProps {
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
}

const goTo = (path: string) => {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
};

export function LoginView({ isAdminPortal = false, setIsAdminPortal, setIsFacultyPortal, setView, ...rest }: LoginViewProps) {
  return (
    <PortalLoginForm
      {...rest}
      setView={setView}
      viewKey="login"
      eyebrowIcon={ShieldCheck}
      eyebrow="Student portal"
      title="Welcome back"
      description="Sign in to continue to your IntegrityOS workspace."
      emailLabel="Email address"
      emailPlaceholder="charanbalajineelampalli752005@gmail.com"
      domainError={() => null}
      demoPortal="student"
      submitLabel="Sign in"
      onForgotPassword={() => setView("forgot-email")}
      belowSso={
        !isAdminPortal && (
          <>
            Don't have an account? <TextLink onClick={() => setView("register")}>Create one</TextLink>
          </>
        )
      }
      portalLinks={[
        {
          label: "Faculty",
          icon: GraduationCap,
          onClick: () => {
            setIsFacultyPortal?.(true);
            goTo("/faculty-login");
          },
        },
        { label: "Support", icon: LifeBuoy, onClick: () => goTo("/support-login") },
        { label: isAdminPortal ? "Student" : "Admin", icon: ShieldCheck, onClick: () => setIsAdminPortal?.(!isAdminPortal) },
      ]}
    />
  );
}
