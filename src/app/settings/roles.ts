import type { LucideIcon } from "lucide-react";
import { Bell, Camera, ClipboardCheck, Lock, Palette, Server, ShieldCheck, UserCog, UserRound } from "lucide-react";

export type SettingsRole = "candidate" | "faculty" | "support" | "admin";

export type SettingsSectionId =
  | "account"
  | "security"
  | "appearance"
  | "camera"
  | "exam-rules"
  | "notifications"
  | "privacy"
  | "system"
  | "admin";

export interface SettingsSectionMeta {
  id: SettingsSectionId;
  label: string;
  icon: LucideIcon;
  roles: SettingsRole[];
}

export const SETTINGS_SECTIONS: SettingsSectionMeta[] = [
  { id: "account", label: "Account", icon: UserRound, roles: ["candidate", "faculty", "support", "admin"] },
  { id: "security", label: "Security", icon: ShieldCheck, roles: ["candidate", "faculty", "support", "admin"] },
  { id: "appearance", label: "Appearance", icon: Palette, roles: ["candidate", "faculty", "support", "admin"] },
  { id: "camera", label: "Camera & Face ID", icon: Camera, roles: ["candidate", "faculty"] },
  { id: "exam-rules", label: "Examination rules", icon: ClipboardCheck, roles: ["faculty"] },
  { id: "notifications", label: "Notifications", icon: Bell, roles: ["candidate", "faculty", "support", "admin"] },
  { id: "privacy", label: "Privacy & data", icon: Lock, roles: ["candidate", "faculty", "support", "admin"] },
  { id: "system", label: "System", icon: Server, roles: ["admin"] },
  { id: "admin", label: "Users & audit", icon: UserCog, roles: ["admin"] },
];

export function toSettingsRole(role: string | null | undefined): SettingsRole {
  if (role === "admin") return "admin";
  if (role === "faculty") return "faculty";
  if (role === "support") return "support";
  return "candidate";
}

export function sectionsForRole(role: SettingsRole) {
  return SETTINGS_SECTIONS.filter((s) => s.roles.includes(role));
}
