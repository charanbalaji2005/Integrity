import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  X, 
  User, 
  Mail, 
  Phone, 
  Briefcase, 
  Shield, 
  ShieldAlert, 
  Clock, 
  History, 
  Laptop, 
  Key, 
  Lock, 
  Settings, 
  Calendar,
  LogOut,
  UserCheck,
  Camera,
  ScanFace
} from "lucide-react";
import { useProfile, UserProfile } from "../context/ProfileContext";
import { PasswordSecuritySection } from "./PasswordSecuritySection";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { toast } from "sonner";

interface ProfileCenterProps {
  isOpen: boolean;
  onClose: () => void;
  handleLogout: () => void;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.08
    }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 15 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { type: "spring", damping: 25, stiffness: 180 }
  }
};

export const ProfileCenter: React.FC<ProfileCenterProps> = ({ isOpen, onClose, handleLogout }) => {
  const {
    profile,
    updateProfile,
    changePassword,
    toggle2FA,
    activityHistory,
    activeSessions,
    fetchActivityHistory,
    fetchActiveSessions,
    revokeSession,
    refreshProfile
  } = useProfile();

  // Camera Face scan states
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraStatus, setCameraStatus] = useState<"idle" | "scanning" | "verified">("idle");
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [isUploadingFace, setIsUploadingFace] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      setCameraStream(null);
    }
    setCameraStatus("idle");
    setCapturedPhoto(null);
  };

  const startCamera = async () => {
    setCameraStatus("scanning");
    setCapturedPhoto(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
      });
      setCameraStream(stream);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      }, 100);
    } catch (err) {
      setCameraStatus("idle");
      toast.error("Could not access webcam. Please verify permissions.");
    }
  };

  const capturePhoto = async () => {
    if (!videoRef.current || !cameraStream || !profile) return;
    setIsUploadingFace(true);

    try {
      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = 480;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not construct canvas context");

      ctx.drawImage(videoRef.current, 0, 0, 640, 480);
      const base64Image = canvas.toDataURL("image/jpeg");
      setCapturedPhoto(base64Image);

      // Verify the face on the backend proctoring check
      const verifyRes = await fetch("/api/proctoring/face-check", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": profile.id,
          "x-user-role": profile.role,
        },
        body: JSON.stringify({ selfie: base64Image }),
      });

      const verifyData = await verifyRes.json();
      if (!verifyRes.ok || !verifyData.success || !verifyData.data.faceDetected) {
        throw new Error(verifyData.message || verifyData.data?.message || "No face detected. Please align your face correctly.");
      }

      // Enforce face match if a face was previously registered
      if (profile.image && !verifyData.data.match) {
        throw new Error("Face verification failed: Captured face does not match your previously registered face.");
      }

      // Face check succeeded! Update the profile image in the database
      const profileRes = await fetch("/api/profile", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": profile.id,
          "x-user-role": profile.role,
        },
        body: JSON.stringify({ image: base64Image }),
      });

      const profileData = await profileRes.json();
      if (!profileRes.ok || !profileData.success) {
        throw new Error(profileData.message || "Failed to update profile image in database");
      }

      setCameraStatus("verified");
      toast.success("Face updated successfully!");
      
      // Refresh user profile details in context
      await refreshProfile();
      
      // Stop camera and close dialog
      stopCamera();
      setIsCameraOpen(false);
    } catch (err: any) {
      toast.error(err.message || "Face verification failed.");
      setCapturedPhoto(null);
    } finally {
      setIsUploadingFace(false);
    }
  };

  const [activeTab, setActiveTab] = useState<"info" | "security">("info");
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Edit fields
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [bio, setBio] = useState("");
  const [institution, setInstitution] = useState("");
  const [department, setDepartment] = useState("");
  const [designation, setDesignation] = useState("");
  
  // Student specific fields
  const [rollNumber, setRollNumber] = useState("");
  const [semester, setSemester] = useState("");
  const [branch, setBranch] = useState("");
  const [section, setSection] = useState("");

  // Faculty specific
  const [subjects, setSubjects] = useState("");

  // Password fields
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [isChangingPass, setIsChangingPass] = useState(false);

  // Initialize edit fields
  useEffect(() => {
    if (profile) {
      setName(profile.name || "");
      setPhone(profile.phoneNumber || "");
      setBio(profile.bio || "");
      setInstitution(profile.institutionName || "");
      setDepartment(profile.department || "");
      setDesignation(profile.designation || "");
      setRollNumber(profile.rollNumber || "");
      setSemester(profile.semester || "");
      setBranch(profile.branch || "");
      setSection(profile.section || "");
      setSubjects(profile.subjects || "");
    }
  }, [profile]);

  useEffect(() => {
    if (isOpen) {
      fetchActivityHistory();
      fetchActiveSessions();
    }
  }, [isOpen, fetchActivityHistory, fetchActiveSessions]);

  if (!profile) return null;

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    const data: Partial<UserProfile> = {
      name,
      phoneNumber: phone,
      bio,
      institutionName: institution,
      department,
      designation,
      rollNumber,
      semester,
      branch,
      section,
      subjects
    };
    const success = await updateProfile(data);
    setIsSaving(false);
    if (success) {
      setIsEditing(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError("");

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError("All password fields are required");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords do not match");
      return;
    }

    if (newPassword.length < 6) {
      setPasswordError("Password must be at least 6 characters long");
      return;
    }

    setIsChangingPass(true);
    const success = await changePassword(currentPassword, newPassword);
    setIsChangingPass(false);
    if (success) {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      // Force logout triggers on password change success
      handleLogout();
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case "admin": return "text-zinc-950 bg-zinc-150 border-zinc-300";
      case "faculty": return "text-indigo-700 bg-indigo-50 border-indigo-200";
      case "support": return "text-[#9a7b4f] bg-[#FAF0DD] border-[#e3d5ba]";
      default: return "text-emerald-700 bg-emerald-50 border-emerald-200";
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop Blur overlay */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.4 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/30 backdrop-blur-[2px] z-45"
          />

          {/* Sliding Side Panel Drawer */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 26, stiffness: 220 }}
            className="fixed right-0 top-0 h-screen w-full sm:max-w-[460px] bg-white border-l border-[#ebdcc9] shadow-2xl z-50 flex flex-col overflow-hidden text-xs"
          >
            {/* Header */}
            <div className="p-5 border-b border-[#ebdcc9]/40 flex justify-between items-center bg-[#faf9f6]">
              <div className="flex items-center gap-2">
                <Settings className="size-4 text-zinc-900" />
                <h2 className="font-extrabold text-sm text-[#1a1917]">Profile Settings</h2>
              </div>
              <button 
                onClick={onClose}
                className="p-1.5 hover:bg-zinc-100 rounded-xl transition cursor-pointer border-none outline-none"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Content Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Profile Card Hero */}
              <div className="flex flex-col items-center text-center p-5 border border-[#ebdcc9]/40 rounded-2xl bg-zinc-50/50 shadow-sm relative">
                <div 
                  className="relative group cursor-pointer" 
                  onClick={() => { setIsCameraOpen(true); startCamera(); }}
                  title="Update Registered Face"
                >
                  <div className="size-20 rounded-full bg-zinc-950 border-2 border-[#ebdcc9] flex items-center justify-center font-bold text-2xl text-white shadow select-none uppercase overflow-hidden relative">
                    {profile.image ? (
                      <img src={profile.image} alt={profile.name} className="size-full object-cover group-hover:opacity-40 transition-opacity" />
                    ) : (
                      profile.name.charAt(0)
                    )}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity text-white rounded-full">
                      <Camera className="size-5" />
                    </div>
                  </div>
                  <span className="absolute bottom-0 right-0 size-3.5 bg-emerald-500 rounded-full border-2 border-white flex items-center justify-center">
                    <span className="size-1.5 rounded-full bg-white animate-pulse" />
                  </span>
                </div>

                <h3 className="font-extrabold text-sm text-zinc-900 mt-3">{profile.name}</h3>
                <span className="text-[10px] text-[#8e8a80] font-mono select-all mt-0.5">{profile.email}</span>

                <div className="flex gap-1.5 mt-3">
                  <span className={`px-2.5 py-0.5 rounded-full border text-[9px] font-bold uppercase select-none ${getRoleColor(profile.role)}`}>
                    {profile.role === "user" ? "Student" : profile.role}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full border text-[9px] font-bold uppercase text-emerald-600 bg-emerald-50 border-emerald-200 select-none">
                    {profile.status}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => { setIsCameraOpen(true); startCamera(); }}
                  className="mt-3 px-3 py-1.5 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50 text-[10px] font-bold text-zinc-800 transition flex items-center gap-1.5 shadow-sm cursor-pointer outline-none"
                >
                  <Camera className="size-3.5 text-zinc-600" />
                  Update Registered Face
                </button>
              </div>

              {/* Navigation Tabs */}
              <div className="flex border-b border-[#ebdcc9]/40">
                <button
                  onClick={() => { setActiveTab("info"); setIsEditing(false); }}
                  className={`flex-1 pb-2 text-center font-bold border-b-2 transition ${
                    activeTab === "info"
                      ? "border-zinc-950 text-zinc-950"
                      : "border-transparent text-zinc-400 hover:text-zinc-600"
                  }`}
                >
                  General Profile
                </button>
                <button
                  onClick={() => setActiveTab("security")}
                  className={`flex-1 pb-2 text-center font-bold border-b-2 transition ${
                    activeTab === "security"
                      ? "border-zinc-950 text-zinc-950"
                      : "border-transparent text-zinc-400 hover:text-zinc-600"
                  }`}
                >
                  Security & Activity
                </button>
              </div>

              {/* Tab Content Display */}
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.15 }}
                className="space-y-5"
              >
                {activeTab === "info" ? (
                  /* TAB 1: INFO VIEW / EDIT */
                  <form onSubmit={handleSaveProfile} className="space-y-4">
                    <div className="flex justify-between items-center mb-1">
                      <h4 className="font-extrabold text-[11px] text-[#8e8a80] uppercase tracking-wider">Information details</h4>
                      {!isEditing ? (
                        <button
                          type="button"
                          onClick={() => setIsEditing(true)}
                          className="text-[10px] font-bold text-zinc-950 underline hover:no-underline cursor-pointer border-none bg-transparent"
                        >
                          Edit Profile Details
                        </button>
                      ) : (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setIsEditing(false)}
                            className="text-[10px] font-bold text-zinc-550 hover:underline cursor-pointer border-none bg-transparent"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="space-y-3.5">
                      {/* Name input */}
                      <div className="flex flex-col gap-1">
                        <label className="font-bold text-zinc-700">Full Name</label>
                        <input
                          type="text"
                          disabled={!isEditing}
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          className="h-9 px-3 border border-[#ebdcc9] rounded-xl bg-zinc-50/50 disabled:bg-zinc-50 disabled:opacity-70 focus:outline-none focus:border-zinc-900"
                        />
                      </div>

                      {/* Phone input */}
                      <div className="flex flex-col gap-1">
                        <label className="font-bold text-zinc-700">Phone Number</label>
                        <input
                          type="tel"
                          disabled={!isEditing}
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          className="h-9 px-3 border border-[#ebdcc9] rounded-xl bg-zinc-50/50 disabled:bg-zinc-50 disabled:opacity-70 focus:outline-none focus:border-zinc-900"
                        />
                      </div>

                      {/* Bio input */}
                      <div className="flex flex-col gap-1">
                        <label className="font-bold text-zinc-700">Short Bio</label>
                        <textarea
                          disabled={!isEditing}
                          value={bio}
                          onChange={(e) => setBio(e.target.value)}
                          rows={2}
                          className="p-3 border border-[#ebdcc9] rounded-xl bg-zinc-50/50 disabled:bg-zinc-50 disabled:opacity-70 focus:outline-none focus:border-zinc-900 resize-none font-sans"
                          placeholder="Introduce yourself..."
                        />
                      </div>

                      {/* University/Institution */}
                      <div className="flex flex-col gap-1">
                        <label className="font-bold text-zinc-700">Institution Name</label>
                        <input
                          type="text"
                          disabled={!isEditing}
                          value={institution}
                          onChange={(e) => setInstitution(e.target.value)}
                          className="h-9 px-3 border border-[#ebdcc9] rounded-xl bg-zinc-50/50 disabled:bg-zinc-50 disabled:opacity-70 focus:outline-none focus:border-zinc-900"
                        />
                      </div>

                      {/* Department */}
                      <div className="flex flex-col gap-1">
                        <label className="font-bold text-zinc-700">Department</label>
                        <input
                          type="text"
                          disabled={!isEditing}
                          value={department}
                          onChange={(e) => setDepartment(e.target.value)}
                          className="h-9 px-3 border border-[#ebdcc9] rounded-xl bg-zinc-50/50 disabled:bg-zinc-50 disabled:opacity-70 focus:outline-none focus:border-zinc-900"
                        />
                      </div>

                      {/* Designation */}
                      <div className="flex flex-col gap-1">
                        <label className="font-bold text-zinc-700">Designation</label>
                        <input
                          type="text"
                          disabled={!isEditing}
                          value={designation}
                          onChange={(e) => setDesignation(e.target.value)}
                          className="h-9 px-3 border border-[#ebdcc9] rounded-xl bg-zinc-50/50 disabled:bg-zinc-50 disabled:opacity-70 focus:outline-none focus:border-zinc-900"
                        />
                      </div>

                      {/* Student Specific Fields */}
                      {profile.role === "user" && (
                        <div className="grid grid-cols-2 gap-3 border-t pt-3 border-[#ebdcc9]/30">
                          <div className="flex flex-col gap-1">
                            <label className="font-bold text-zinc-700">Roll Number / Student ID</label>
                            <input
                              type="text"
                              disabled={!isEditing}
                              value={rollNumber}
                              onChange={(e) => setRollNumber(e.target.value)}
                              className="h-9 px-3 border border-[#ebdcc9] rounded-xl bg-zinc-50/50 disabled:bg-zinc-50 disabled:opacity-70 focus:outline-none"
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className="font-bold text-zinc-700">Semester</label>
                            <input
                              type="text"
                              disabled={!isEditing}
                              value={semester}
                              onChange={(e) => setSemester(e.target.value)}
                              className="h-9 px-3 border border-[#ebdcc9] rounded-xl bg-zinc-50/50 disabled:bg-zinc-50 disabled:opacity-70 focus:outline-none"
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className="font-bold text-zinc-700">Branch</label>
                            <input
                              type="text"
                              disabled={!isEditing}
                              value={branch}
                              onChange={(e) => setBranch(e.target.value)}
                              className="h-9 px-3 border border-[#ebdcc9] rounded-xl bg-zinc-50/50 disabled:bg-zinc-50 disabled:opacity-70 focus:outline-none"
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className="font-bold text-zinc-700">Section</label>
                            <input
                              type="text"
                              disabled={!isEditing}
                              value={section}
                              onChange={(e) => setSection(e.target.value)}
                              className="h-9 px-3 border border-[#ebdcc9] rounded-xl bg-zinc-50/50 disabled:bg-zinc-50 disabled:opacity-70 focus:outline-none"
                            />
                          </div>
                        </div>
                      )}

                      {/* Faculty Specific Fields */}
                      {profile.role === "faculty" && (
                        <div className="flex flex-col gap-1 border-t pt-3 border-[#ebdcc9]/30">
                          <label className="font-bold text-zinc-700">Assigned Subjects</label>
                          <input
                            type="text"
                            disabled={!isEditing}
                            value={subjects}
                            onChange={(e) => setSubjects(e.target.value)}
                            className="h-9 px-3 border border-[#ebdcc9] rounded-xl bg-zinc-50/50 disabled:bg-zinc-50 disabled:opacity-70 focus:outline-none"
                            placeholder="e.g. Algorithms, Distributed Systems"
                          />
                        </div>
                      )}

                      {/* Info Metadata */}
                      <div className="flex items-center gap-1.5 text-[10px] text-zinc-400 mt-2 font-mono">
                        <Calendar className="size-3.5 text-zinc-400" />
                        <span>Joined Platform: {profile.joiningDate ? new Date(profile.joiningDate).toLocaleDateString() : new Date(profile.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>

                    {isEditing && (
                      <button
                        type="submit"
                        disabled={isSaving}
                        className="w-full h-10 mt-4 rounded-xl bg-zinc-950 text-white font-bold hover:bg-zinc-850 active:scale-[0.985] transition-all cursor-pointer flex items-center justify-center gap-2"
                      >
                        {isSaving ? (
                          <>
                            <span className="size-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            Saving details...
                          </>
                        ) : (
                          <>
                            <UserCheck className="size-4" /> Save profile changes
                          </>
                        )}
                      </button>
                    )}
                  </form>
                ) : (
                  /* TAB 2: SECURITY & ACTIVITY */
                  <div className="space-y-6">
                    {/* 2FA Toggle */}
                    <div className="p-4 border border-[#ebdcc9] rounded-2xl bg-zinc-50/30 flex items-start justify-between gap-3 shadow-sm">
                      <div className="space-y-1">
                        <span className="font-extrabold text-zinc-900 block flex items-center gap-1.5">
                          <Shield className="size-4 text-zinc-800" /> Two-Factor Authentication (2FA)
                        </span>
                        <p className="text-[10px] text-zinc-400 leading-tight">Secure your login details by enabling standard secondary verification sweeps.</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={profile.twoFactorEnabled}
                        onChange={(e) => toggle2FA(e.target.checked)}
                        className="size-4.5 mt-1 cursor-pointer text-zinc-950 focus:ring-zinc-950 rounded"
                      />
                    </div>

                    <PasswordSecuritySection
                      userId={profile.id}
                      userDetails={{
                        name: profile.name,
                        email: profile.email,
                        rollNumber: profile.rollNumber,
                        academicId: profile.academicId,
                      }}
                      onSuccessLogout={handleLogout}
                    />

                    {/* Active Sessions List */}
                    <div className="space-y-2.5">
                      <h4 className="font-extrabold text-[11px] text-[#8e8a80] uppercase tracking-wider flex items-center gap-2">
                        <Laptop className="size-4 text-zinc-800" /> Active Login Sessions
                      </h4>
                      <div className="space-y-2 max-h-[150px] overflow-y-auto pr-1">
                        {activeSessions.map((s) => (
                          <div key={s.id} className="p-3 border rounded-xl bg-white hover:bg-neutral-50 transition flex justify-between items-center text-[10px] shadow-sm">
                            <div className="space-y-1">
                              <span className="font-bold text-zinc-900 block">{s.ipAddress || "Localhost"}</span>
                              <span className="text-zinc-400 block truncate max-w-[200px]" title={s.userAgent || ""}>
                                {s.userAgent || "Unknown Device"}
                              </span>
                            </div>
                            <button
                              onClick={() => revokeSession(s.id)}
                              className="text-[9.5px] font-bold text-rose-600 hover:bg-rose-50 border border-rose-200/50 px-2 py-0.5 rounded cursor-pointer"
                            >
                              Revoke
                            </button>
                          </div>
                        ))}
                        {activeSessions.length === 0 && (
                          <div className="text-center py-4 text-zinc-400">No session records found.</div>
                        )}
                      </div>
                    </div>

                    {/* Activity Timeline logs */}
                    <div className="space-y-3">
                      <h4 className="font-extrabold text-[11px] text-[#8e8a80] uppercase tracking-wider flex items-center gap-2">
                        <History className="size-4 text-zinc-800" /> Activity Log History
                      </h4>
                      <div className="border-l border-zinc-200 pl-4 space-y-4 max-h-[160px] overflow-y-auto py-1 pr-1 scrollbar-thin">
                        {activityHistory.map((h) => (
                          <div key={h.id} className="relative space-y-0.5">
                            <span className="absolute -left-[20.5px] top-1 size-2 rounded-full bg-zinc-950 border border-white" />
                            <span className="font-bold text-zinc-800 block capitalize">{h.action.replace("_", " ")}</span>
                            <span className="text-[9px] text-zinc-400 font-mono block">
                              {new Date(h.createdAt).toLocaleString()} &bull; {h.ipAddress || "Local"}
                            </span>
                          </div>
                        ))}
                        {activityHistory.length === 0 && (
                          <div className="text-center py-4 text-zinc-400">No activity history.</div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            </div>

            {/* Footer Panel */}
            <div className="p-5 border-t border-[#ebdcc9]/40 bg-[#faf9f6] flex gap-3">
              <button
                onClick={() => { onClose(); handleLogout(); }}
                className="w-full h-10 px-3 text-xs gap-1.5 border border-rose-500/20 hover:bg-rose-500/10 text-rose-600 rounded-xl font-bold transition-all duration-300 cursor-pointer flex items-center justify-center"
              >
                <LogOut className="size-3.5" />
                Sign Out Account
              </button>
            </div>
          </motion.div>

          {/* Camera Face Update Dialog */}
          <Dialog 
            open={isCameraOpen} 
            onOpenChange={(open) => {
              if (!open) {
                stopCamera();
                setIsCameraOpen(false);
              }
            }}
          >
            <DialogContent className="sm:max-w-[480px] rounded-[32px] border-2 border-[#ebdcc9] bg-white p-8 shadow-2xl backdrop-blur-xl outline-none">
              <style>{`
                @keyframes scan-line {
                  0% { top: 0%; }
                  50% { top: 100%; }
                  100% { top: 0%; }
                }
              `}</style>
              
              <DialogHeader className="flex flex-col items-center gap-2 text-center">
                <div className="flex size-14 items-center justify-center rounded-full bg-[#fcf8f2] border border-[#ebdcc9]">
                  <ScanFace className="size-7 text-[#c5af8a]" />
                </div>
                <DialogTitle className="text-xl font-bold tracking-tight text-zinc-900">
                  Register Face Scan
                </DialogTitle>
                <p className="text-xs text-zinc-500 max-w-[340px]">
                  To ensure academic integrity, capture a clear photo of your face. It will be verified by the AI Proctoring core.
                </p>
              </DialogHeader>

              <div className="my-6 flex flex-col items-center justify-center">
                {/* Camera view screen */}
                <div className="relative size-60 rounded-full border-4 border-[#ebdcc9] bg-zinc-950 overflow-hidden shadow-inner flex items-center justify-center">
                  {capturedPhoto ? (
                    <img src={capturedPhoto} alt="Captured Face" className="size-full object-cover" />
                  ) : cameraStream ? (
                    <video 
                      ref={videoRef} 
                      autoPlay 
                      playsInline 
                      muted 
                      className="size-full object-cover scale-x-[-1]" 
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-zinc-650">
                      <span className="size-6 border-2 border-zinc-500 border-t-transparent rounded-full animate-spin" />
                      <span className="text-[10px] font-medium text-zinc-400">Initializing camera...</span>
                    </div>
                  )}

                  {/* Circular scan overlay */}
                  {cameraStatus === "scanning" && !capturedPhoto && (
                    <div className="absolute inset-0 border border-emerald-500/30 rounded-full pointer-events-none animate-pulse">
                      <div 
                        className="absolute inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-emerald-500 to-transparent" 
                        style={{ animation: "scan-line 2s linear infinite", position: "absolute" }}
                      />
                    </div>
                  )}
                </div>
                
                {cameraStatus === "scanning" && !capturedPhoto && (
                  <span className="mt-3 text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200/50 px-2.5 py-0.5 rounded-full uppercase tracking-wider animate-pulse">
                    Align Face in Ring
                  </span>
                )}
              </div>

              <DialogFooter className="flex flex-col sm:flex-row gap-2.5">
                <button
                  type="button"
                  disabled={isUploadingFace}
                  onClick={() => {
                    stopCamera();
                    setIsCameraOpen(false);
                  }}
                  className="flex-1 h-11 border border-zinc-200 rounded-xl hover:bg-zinc-50 font-bold transition disabled:opacity-50 cursor-pointer border-none bg-transparent outline-none"
                >
                  Cancel
                </button>
                
                {capturedPhoto ? (
                  <button
                    type="button"
                    disabled={true}
                    className="flex-1 h-11 bg-emerald-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 border-none outline-none"
                  >
                    <span className="size-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Verifying Face...
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={!cameraStream || isUploadingFace}
                    onClick={capturePhoto}
                    className="flex-1 h-11 bg-zinc-950 hover:bg-zinc-900 text-white rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer border-none outline-none"
                  >
                    Capture & Save Face
                  </button>
                )}
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </AnimatePresence>
  );
};
