import React, { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { useProfile, type UserProfile } from "../../context/ProfileContext";
import { PasswordSecuritySection } from "../../components/PasswordSecuritySection";
import { Button, Card, SectionHeader, TextField } from "../ui";
import type { SettingsRole } from "../roles";

type EditableField =
  | "name"
  | "phoneNumber"
  | "bio"
  | "institutionName"
  | "department"
  | "designation"
  | "rollNumber"
  | "semester"
  | "branch"
  | "section"
  | "subjects";

const FIELDS_BY_ROLE: Record<SettingsRole, { key: EditableField; label: string; multiline?: boolean }[]> = {
  candidate: [
    { key: "rollNumber", label: "Roll number" },
    { key: "institutionName", label: "Institution" },
    { key: "branch", label: "Branch" },
    { key: "semester", label: "Semester" },
    { key: "section", label: "Section" },
  ],
  faculty: [
    { key: "designation", label: "Designation" },
    { key: "institutionName", label: "Institution" },
    { key: "department", label: "Department" },
    { key: "subjects", label: "Subjects taught" },
  ],
  support: [
    { key: "designation", label: "Designation" },
    { key: "department", label: "Team" },
  ],
  admin: [
    { key: "designation", label: "Designation" },
    { key: "institutionName", label: "Institution" },
    { key: "department", label: "Department" },
  ],
};

export function AccountSection({ role, onLogout }: { role: SettingsRole; onLogout: () => void }) {
  const { profile, isLoading, updateProfile } = useProfile();
  const roleFields = FIELDS_BY_ROLE[role];
  const allKeys = useMemo<EditableField[]>(
    () => ["name", "phoneNumber", "bio", ...roleFields.map((f) => f.key)],
    [roleFields],
  );

  const toForm = (p: UserProfile | null) =>
    Object.fromEntries(allKeys.map((k) => [k, (p?.[k] as string | null) ?? ""])) as Record<EditableField, string>;

  const [form, setForm] = useState(() => toForm(profile));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(toForm(profile));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  const dirty = profile ? allKeys.some((k) => (form[k] ?? "") !== ((profile[k] as string | null) ?? "")) : false;
  const set = (k: EditableField) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    await updateProfile(form);
    setSaving(false);
  };

  if (!profile) {
    return (
      <div className="flex items-center gap-2 text-[13px] text-[#8a8a8a]">
        <Loader2 className="size-4 animate-spin" /> {isLoading ? "Loading your profile..." : "Profile unavailable."}
      </div>
    );
  }

  return (
    <div>
      <SectionHeader title="Account" description="Your profile details and password." />

      <form onSubmit={save}>
        <Card
          title="Profile"
          description="Shown to faculty and administrators on reports and messages."
          action={
            <Button type="submit" disabled={!dirty || saving || !form.name.trim()}>
              {saving && <Loader2 className="size-3.5 animate-spin" />}
              Save changes
            </Button>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Full name" value={form.name} onChange={set("name")} hint={!form.name.trim() ? "Name is required." : undefined} />
            <TextField
              label="Email"
              value={profile.email}
              disabled
              hint="Contact support to change your sign-in email."
            />
            <TextField label="Phone" type="tel" value={form.phoneNumber} onChange={set("phoneNumber")} placeholder="+91 ..." />
            {role === "candidate" && profile.academicId && (
              <TextField label="Academic ID" value={profile.academicId} disabled />
            )}
            {roleFields.map((f) => (
              <TextField key={f.key} label={f.label} value={form[f.key]} onChange={set(f.key)} multiline={f.multiline} />
            ))}
            {role === "admin" && profile.accessLevel && <TextField label="Access level" value={profile.accessLevel} disabled />}
            <div className="sm:col-span-2">
              <TextField label="Bio" value={form.bio} onChange={set("bio")} multiline placeholder="A short introduction" />
            </div>
          </div>
          {dirty && (
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setForm(toForm(profile))}>
                Discard
              </Button>
            </div>
          )}
        </Card>
      </form>

      <Card title="Password" description="Changing your password signs you out of every device.">
        <PasswordSecuritySection
          userId={profile.id}
          userDetails={{
            name: profile.name,
            email: profile.email,
            rollNumber: profile.rollNumber,
            academicId: profile.academicId,
          }}
          onSuccessLogout={onLogout}
        />
      </Card>
    </div>
  );
}
