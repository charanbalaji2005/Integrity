import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { apiFetch } from "../utils/api-client";

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: string;
  status: string;
  phoneNumber: string | null;
  designation: string | null;
  bio: string | null;
  joiningDate: string | null;
  twoFactorEnabled: boolean;
  institutionName: string | null;
  department: string | null;
  academicId: string | null;
  rollNumber: string | null;
  semester: string | null;
  branch: string | null;
  section: string | null;
  subjects: string | null;
  accessLevel: string | null;
  managedDepartments: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserLog {
  id: string;
  userId: string;
  action: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface UserSession {
  id: string;
  userId: string;
  token: string;
  expiresAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

interface ProfileContextType {
  profile: UserProfile | null;
  isLoading: boolean;
  activityHistory: UserLog[];
  activeSessions: UserSession[];
  refreshProfile: () => Promise<void>;
  updateProfile: (data: Partial<UserProfile>) => Promise<boolean>;
  changePassword: (current: string, newPass: string) => Promise<boolean>;
  toggle2FA: (enabled: boolean) => Promise<boolean>;
  fetchActivityHistory: () => Promise<void>;
  fetchActiveSessions: () => Promise<void>;
  revokeSession: (id: string) => Promise<boolean>;
}

const ProfileContext = createContext<ProfileContextType | undefined>(undefined);

export const useProfile = () => {
  const context = useContext(ProfileContext);
  if (!context) {
    throw new Error("useProfile must be used within a ProfileProvider");
  }
  return context;
};

interface ProfileProviderProps {
  children: React.ReactNode;
  userId: string;
  userRole: string;
}

export const ProfileProvider: React.FC<ProfileProviderProps> = ({
  children,
  userId,
  userRole: _userRole
}) => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activityHistory, setActivityHistory] = useState<UserLog[]>([]);
  const [activeSessions, setActiveSessions] = useState<UserSession[]>([]);

  const refreshProfile = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await apiFetch("/api/profile");
      if (res.ok) {
        const data = await res.json();
        setProfile(data.data || null);
      }
    } catch (err) {
      console.error("Failed to fetch profile details", err);
    }
  }, [userId]);

  const updateProfile = async (data: Partial<UserProfile>): Promise<boolean> => {
    try {
      const res = await apiFetch("/api/profile", {
        method: "PUT",
        body: JSON.stringify(data)
      });
      if (res.ok) {
        const updated = await res.json();
        setProfile(updated.data || null);
        toast.success("Profile details successfully updated");
        return true;
      } else {
        toast.error("Failed to save profile changes");
        return false;
      }
    } catch {
      toast.error("Network error saving profile");
      return false;
    }
  };

  const changePassword = async (current: string, newPass: string): Promise<boolean> => {
    try {
      const res = await apiFetch("/api/profile/password", {
        method: "PUT",
        body: JSON.stringify({ currentPassword: current, newPassword: newPass })
      });
      if (res.ok) {
        toast.success("Password successfully changed. Session revoked.");
        return true;
      } else {
        const err = await res.json();
        toast.error(err.message || "Failed to change password");
        return false;
      }
    } catch {
      toast.error("Network error changing password");
      return false;
    }
  };

  const toggle2FA = async (enabled: boolean): Promise<boolean> => {
    try {
      const res = await apiFetch("/api/profile/2fa", {
        method: "POST",
        body: JSON.stringify({ enabled })
      });
      if (res.ok) {
        const updated = await res.json();
        setProfile(updated.data || null);
        toast.success(enabled ? "2FA security successfully enabled" : "2FA security successfully disabled");
        return true;
      } else {
        toast.error("Failed to update 2FA configuration");
        return false;
      }
    } catch {
      toast.error("Network error configuring security");
      return false;
    }
  };

  const fetchActivityHistory = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await apiFetch("/api/profile/history");
      if (res.ok) {
        const data = await res.json();
        setActivityHistory(data.data || []);
      }
    } catch (err) {
      console.error("Failed to load activity logs", err);
    }
  }, [userId]);

  const fetchActiveSessions = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await apiFetch("/api/profile/sessions");
      if (res.ok) {
        const data = await res.json();
        setActiveSessions(data.data || []);
      }
    } catch (err) {
      console.error("Failed to load active sessions", err);
    }
  }, [userId]);

  const revokeSession = async (id: string): Promise<boolean> => {
    try {
      const res = await apiFetch(`/api/profile/sessions/${id}`, {
        method: "DELETE"
      });
      if (res.ok) {
        setActiveSessions((prev) => prev.filter((s) => s.id !== id));
        toast.success("Active session revoked");
        return true;
      } else {
        toast.error("Failed to revoke session");
        return false;
      }
    } catch {
      toast.error("Network error revoking session");
      return false;
    }
  };

  useEffect(() => {
    if (!userId) return;
    setIsLoading(true);
    refreshProfile().finally(() => setIsLoading(false));
  }, [refreshProfile, userId]);

  return (
    <ProfileContext.Provider
      value={{
        profile,
        isLoading,
        activityHistory,
        activeSessions,
        refreshProfile,
        updateProfile,
        changePassword,
        toggle2FA,
        fetchActivityHistory,
        fetchActiveSessions,
        revokeSession
      }}
    >
      {children}
    </ProfileContext.Provider>
  );
};
