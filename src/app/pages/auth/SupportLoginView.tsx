import React from "react";
import { GraduationCap, LifeBuoy, UserRound } from "lucide-react";
import { PortalLoginForm } from "./components/PortalLoginForm";
import { TextLink } from "./components/AuthPrimitives";

interface SupportLoginViewProps {
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
  onNavigate: (to: string) => void;
}

export function SupportLoginView({ onNavigate, setView, ...rest }: SupportLoginViewProps) {
  return (
    <PortalLoginForm
      {...rest}
      setView={setView}
      viewKey="support-login"
      eyebrowIcon={LifeBuoy}
      eyebrow="Support console"
      title="Support sign in"
      description="Assist users, review live violation logs and manage submitted support tickets."
      emailLabel="Support agent email"
      emailPlaceholder="charanbalajineelampalli752005@gmail.com"
      domainError={() => null}
      demoPortal="support"
      submitLabel="Sign in to Support Console"
      belowSso={
        <>
          New support agent?{" "}
          <TextLink onClick={() => onNavigate("/support-register")}>Create a console account</TextLink>
        </>
      }
      portalLinks={[
        { label: "Student", icon: UserRound, onClick: () => onNavigate("/login") },
        {
          label: "Faculty",
          icon: GraduationCap,
          onClick: () => onNavigate("/faculty-login"),
        },
      ]}
    />
  );
}
