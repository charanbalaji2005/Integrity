import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { io, Socket } from "socket.io-client";
import { useProfile } from "../context/ProfileContext";
import { toast } from "sonner";
import {
  MessageSquare,
  Send,
  Paperclip,
  Smile,
  Users,
  User,
  Check,
  X,
  Plus,
  AlertCircle,
  FileText,
  Search,
  Clock,
  CheckCheck,
  Megaphone,
  UserCheck,
  Archive,
  Ban,
  Lock,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";

export function FacultyMessagingView() {
  const { profile } = useProfile();
  const [socket, setSocket] = useState<Socket | null>(null);

  // Active sub-panels
  const [activeTab, setActiveTab] = useState<"announcements" | "class" | "requests" | "dm">("announcements");
  const [activeDmRecipient, setActiveDmRecipient] = useState<any | null>(null);

  // Dynamic Class Chat selection
  const [selectedDept, setSelectedDept] = useState("Computer Science & Engineering");
  const [selectedSem, setSelectedSem] = useState("Semester 4");
  const [selectedSec, setSelectedSec] = useState("Sec A");

  // Data States
  const [messages, setMessages] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());

  // UI States
  const [messageText, setMessageText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [partnerTyping, setPartnerTyping] = useState<string | null>(null);

  // Announcement Composer State
  const [annTarget, setAnnTarget] = useState<"college" | "class">("college");
  const [annContent, setAnnContent] = useState("");
  const [isSendingAnn, setIsSendingAnn] = useState(false);

  // Attachment (mock)
  const [fileAttachment, setFileAttachment] = useState<string | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Profile Update Form
  const [profileName, setProfileName] = useState("");
  const [profileSection, setProfileSection] = useState("");
  const [profileDepartment, setProfileDepartment] = useState("");
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const { refreshProfile } = useProfile();

  const getDeptPrefix = (dept: string) => {
    if (dept === "Computer Science & Engineering") return "CSE";
    if (dept === "Electronics & Communications") return "ECE";
    if (dept === "Electrical & Electronics Engineering") return "EEE";
    if (dept === "Mechanical Engineering") return "MEC";
    return "CSE";
  };

  useEffect(() => {
    if (profile) {
      setProfileName(profile.name || "");
      setProfileDepartment(profile.department || "");
      setProfileSection(profile.section || "");
    }
  }, [profile]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !profileName.trim() || !profileSection.trim() || !profileDepartment) {
      toast.error("Please fill in all details.");
      return;
    }

    const formattedSection = profileSection.split(",").map((s) => s.trim().toUpperCase()).join(", ");
    const prefix = getDeptPrefix(profileDepartment);
    const regex = new RegExp(`^${prefix}-[A-Z]$`);
    const sectionsArray = formattedSection.split(",").map(s => s.trim());
    for (const sec of sectionsArray) {
      if (!regex.test(sec)) {
        toast.error(`Invalid section format: ${sec}. Must match prefix format, e.g. ${prefix}-A.`);
        return;
      }
    }

    setIsUpdatingProfile(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": profile.id,
          "x-user-role": "faculty",
        },
        body: JSON.stringify({
          name: profileName.trim(),
          section: formattedSection,
          department: profileDepartment,
        }),
      });

      if (res.ok) {
        toast.success("Profile updated successfully!");
        await refreshProfile();
      } else {
        toast.error("Failed to update profile.");
      }
    } catch (err) {
      toast.error("Error updating profile.");
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  // Get Room ID
  const getActiveRoomId = (): string => {
    if (activeTab === "announcements") return "college";
    if (activeTab === "class") {
      return `class:${selectedDept}:${selectedSem}:${selectedSec}`;
    }
    if (activeTab === "dm" && activeDmRecipient && profile) {
      const ids = [profile.id, activeDmRecipient.id].sort();
      return `private:${ids[0]}-${ids[1]}`;
    }
    return "";
  };

  // Socket Connection
  useEffect(() => {
    if (!profile) return;

    const socketInstance = io("http://localhost:5050", {
      auth: {
        userId: profile.id,
        userRole: profile.role,
      },
    });

    socketInstance.on("connect", () => {
      console.log("[Socket] Faculty connected to Socket.IO Server");
    });

    socketInstance.on("new-message", (msg: any) => {
      const activeRoom = getActiveRoomId();
      if (msg.roomId === activeRoom) {
        setMessages((prev) => [...prev, msg]);
      }
    });

    socketInstance.on("message-update", (data: any) => {
      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.id !== data.id) return msg;
          if (data.action === "reaction_updated") {
            return { ...msg, reactions: data.reactions };
          }
          if (data.action === "pin_toggled") {
            return { ...msg, isPinned: data.isPinned };
          }
          if (data.action === "message_deleted") {
            return { ...msg, isDeleted: true, content: data.content, attachments: [] };
          }
          if (data.action === "read_receipt_updated") {
            return { ...msg, readBy: data.readBy };
          }
          return msg;
        })
      );
    });

    socketInstance.on("user-typing", (data: { roomId: string; userId: string; username: string; isTyping: boolean }) => {
      const activeRoom = getActiveRoomId();
      if (data.roomId === activeRoom && data.userId !== profile.id) {
        if (data.isTyping) {
          setPartnerTyping(data.username);
        } else {
          setPartnerTyping(null);
        }
      }
    });

    socketInstance.on("user-status", (data: { userId: string; status: "online" | "offline" }) => {
      setOnlineUsers((prev) => {
        const next = new Set(prev);
        if (data.status === "online") {
          next.add(data.userId);
        } else {
          next.delete(data.userId);
        }
        return next;
      });
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, [profile?.id, activeTab, activeDmRecipient?.id, selectedDept, selectedSem, selectedSec]);

  // Join/Leave Rooms on change
  useEffect(() => {
    if (!socket) return;
    const roomId = getActiveRoomId();
    if (!roomId) return;

    socket.emit("join-room", roomId);

    return () => {
      socket.emit("leave-room", roomId);
      setPartnerTyping(null);
    };
  }, [socket, activeTab, activeDmRecipient?.id, selectedDept, selectedSem, selectedSec]);

  // Fetch Message History
  useEffect(() => {
    if (!profile) return;
    const fetchHistory = async () => {
      const roomId = getActiveRoomId();
      if (!roomId) {
        setMessages([]);
        return;
      }
      try {
        let url = `/api/chat/messages?type=${activeTab === "announcements" ? "college" : activeTab}`;
        if (activeTab === "class") {
          url += `&department=${encodeURIComponent(selectedDept)}&semester=${encodeURIComponent(selectedSem)}&section=${encodeURIComponent(selectedSec)}`;
        } else if (activeTab === "dm" && activeDmRecipient) {
          url += `&recipientId=${activeDmRecipient.id}`;
        }
        const res = await fetch(url, {
          headers: { "x-user-id": profile.id, "x-user-role": profile.role },
        });
        if (res.ok) {
          const data = await res.json();
          setMessages(data.data || []);
        }
      } catch (err) {
        console.error("Failed to load message history:", err);
      }
    };

    fetchHistory();
  }, [activeTab, activeDmRecipient?.id, selectedDept, selectedSem, selectedSec, profile?.id]);

  // Fetch lists (requests queue & DM contacts)
  const fetchLists = async () => {
    if (!profile) return;
    try {
      // 1. Fetch Chat Requests
      const reqRes = await fetch("/api/chat/requests", {
        headers: { "x-user-id": profile.id, "x-user-role": profile.role },
      });
      if (reqRes.ok) {
        const reqData = await reqRes.json();
        setRequests(reqData.data || []);
      }

      // 2. Fetch contacts (approved student chats)
      const conRes = await fetch("/api/chat/contacts", {
        headers: { "x-user-id": profile.id, "x-user-role": profile.role },
      });
      if (conRes.ok) {
        const conData = await conRes.json();
        setContacts(conData.data || []);
      }
    } catch (err) {
      console.error("Failed to fetch faculty lists:", err);
    }
  };

  useEffect(() => {
    fetchLists();
  }, [profile?.id, activeTab]);

  // Scroll to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, partnerTyping]);

  // Message Action Handlers
  const handleReactToMessage = async (msgId: string, emoji: string) => {
    if (!profile) return;
    try {
      const res = await fetch(`/api/chat/messages/${msgId}/react`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": profile.id,
          "x-user-role": profile.role
        },
        body: JSON.stringify({ emoji })
      });
      if (res.ok) {
        const data = await res.json();
        setMessages((prev) =>
          prev.map((m) => (m.id === msgId ? { ...m, reactions: data.data } : m))
        );
      }
    } catch (err) {
      toast.error("Failed to toggle reaction");
    }
  };

  const handleTogglePin = async (msgId: string) => {
    if (!profile) return;
    try {
      const res = await fetch(`/api/chat/messages/${msgId}/pin`, {
        method: "POST",
        headers: {
          "x-user-id": profile.id,
          "x-user-role": profile.role
        }
      });
      if (res.ok) {
        const data = await res.json();
        toast.success(data.data.isPinned ? "Message pinned" : "Message unpinned");
        setMessages((prev) =>
          prev.map((m) => (m.id === msgId ? { ...m, isPinned: data.data.isPinned } : m))
        );
      }
    } catch (err) {
      toast.error("Failed to toggle pin");
    }
  };

  const handleDeleteMessage = async (msgId: string, deleteType: "everyone" | "me") => {
    if (!profile) return;
    try {
      const res = await fetch(`/api/chat/messages/${msgId}/delete`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": profile.id,
          "x-user-role": profile.role
        },
        body: JSON.stringify({ deleteType })
      });
      if (res.ok) {
        toast.success("Message deleted");
        setMessages((prev) =>
          prev.map((m) => (m.id === msgId ? { ...m, isDeleted: true, content: "This message was deleted.", attachments: [] } : m))
        );
      }
    } catch (err) {
      toast.error("Failed to delete message");
    }
  };

  // Mark messages as read whenever messages load or change
  useEffect(() => {
    if (!profile || messages.length === 0) return;
    const markAsRead = async () => {
      try {
        const payload: any = { type: activeTab === "announcements" ? "college" : activeTab };
        if (activeTab === "class") {
          payload.department = selectedDept;
          payload.semester = selectedSem;
          payload.section = selectedSec;
        } else if (activeTab === "dm" && activeDmRecipient) {
          payload.recipientId = activeDmRecipient.id;
        }
        await fetch("/api/chat/messages/read", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-user-id": profile.id,
            "x-user-role": profile.role
          },
          body: JSON.stringify(payload)
        });
      } catch (err) {
        console.error("Failed to mark messages as read:", err);
      }
    };
    markAsRead();
  }, [messages.length, activeTab, activeDmRecipient?.id, selectedDept, selectedSem, selectedSec]);

  // Handle Send Message
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!socket || !profile || (!messageText.trim() && !fileAttachment)) return;

    const roomId = getActiveRoomId();
    const payload: any = {
      senderId: profile.id,
      senderName: profile.name,
      senderRole: profile.role,
      content: messageText,
      type: activeTab === "announcements" ? "college" : activeTab,
      roomId,
    };

    if (activeTab === "class") {
      payload.department = selectedDept;
      payload.semester = selectedSem;
      payload.section = selectedSec;
    } else if (activeTab === "dm" && activeDmRecipient) {
      payload.recipientId = activeDmRecipient.id;
    }

    if (fileAttachment) {
      payload.attachments = [fileAttachment];
    }

    socket.emit("send-message", payload);

    // Reset typing status
    socket.emit("typing", {
      roomId,
      userId: profile.id,
      username: profile.name,
      isTyping: false,
    });
    setIsTyping(false);

    setMessageText("");
    setFileAttachment(null);
  };

  // Handle typing status
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMessageText(e.target.value);
    if (!socket || !profile) return;

    const roomId = getActiveRoomId();

    if (!isTyping) {
      setIsTyping(true);
      socket.emit("typing", {
        roomId,
        userId: profile.id,
        username: profile.name,
        isTyping: true,
      });
    }

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit("typing", {
        roomId,
        userId: profile.id,
        username: profile.name,
        isTyping: false,
      });
      setIsTyping(false);
    }, 2000);
  };

  // Handle Request Actions: Approve or Reject
  const handleRequestAction = async (requestId: string, action: "approve" | "reject") => {
    if (!profile) return;
    try {
      const res = await fetch(`/api/chat/requests/${requestId}/action`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": profile.id,
          "x-user-role": profile.role,
        },
        body: JSON.stringify({ action }),
      });

      if (res.ok) {
        toast.success(`Request ${action}d successfully!`);
        fetchLists();
      } else {
        toast.error("Failed to update request.");
      }
    } catch (err) {
      toast.error("Error updating request.");
    }
  };

  // Handle Close Conversation (Direct Chat)
  const handleCloseConversation = async (studentId: string) => {
    if (!profile) return;
    // Find the approved request between this student and faculty to mark it as closed
    const request = requests.find((r) => r.studentId === studentId && r.status === "approved");
    if (!request) return;

    try {
      const res = await fetch(`/api/chat/requests/${request.id}/action`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": profile.id,
          "x-user-role": profile.role,
        },
        body: JSON.stringify({ action: "close" }),
      });

      if (res.ok) {
        toast.success("Direct conversation closed and access revoked.");
        setActiveDmRecipient(null);
        setActiveTab("announcements");
        fetchLists();
      } else {
        toast.error("Failed to close conversation.");
      }
    } catch (err) {
      toast.error("Error closing conversation.");
    }
  };

  // Broadcast announcement helper
  const handlePostAnnouncement = (e: React.FormEvent) => {
    e.preventDefault();
    if (!socket || !profile || !annContent.trim()) return;

    setIsSendingAnn(true);

    const roomId = annTarget === "college" ? "college" : `class:${selectedDept}:${selectedSem}:${selectedSec}`;
    const payload: any = {
      senderId: profile.id,
      senderName: profile.name,
      senderRole: profile.role,
      content: annContent,
      type: annTarget === "college" ? "college" : "class",
      roomId,
    };

    if (annTarget === "class") {
      payload.department = selectedDept;
      payload.semester = selectedSem;
      payload.section = selectedSec;
    }

    if (fileAttachment) {
      payload.attachments = [fileAttachment];
    }

    socket.emit("send-message", payload);
    setAnnContent("");
    setFileAttachment(null);
    setIsSendingAnn(false);
    toast.success("Announcement broadcast successfully!");
  };

  // Mock Upload helper
  const triggerMockUpload = () => {
    const files = ["syllabus_v3.pdf", "midterm_dates.xlsx", "study_notes.docx", "announcement_poster.png"];
    const randomFile = files[Math.floor(Math.random() * files.length)];
    setFileAttachment(randomFile);
    toast.success(`Attached file: ${randomFile}`);
  };

  const isProfileIncomplete = !profile?.name || !profile?.department || !profile?.section;

  return (
    <div className="flex h-[calc(100vh-140px)] w-full gap-5 relative">
      {isProfileIncomplete && (
        <div className="absolute inset-0 bg-neutral-900/60 backdrop-blur-md z-45 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md bg-white p-6 rounded-3xl border border-[#ebdcc9] shadow-xl text-left"
          >
            <h4 className="text-base font-bold text-[#1a1917] flex items-center gap-1.5">
              🏫 Complete Your Faculty Profile
            </h4>
            <p className="text-xs text-[#6b6861] mt-1">
              Please complete your department, name, and handled sections so students from your classes can connect to you.
            </p>
            
            <form onSubmit={handleUpdateProfile} className="mt-4 space-y-3.5">
              <div>
                <label className="text-[11px] font-bold text-[#6b6861] uppercase tracking-wider block mb-1">
                  Full Name
                </label>
                <Input
                  type="text"
                  placeholder="Enter your full name"
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  className="h-9 text-xs"
                  required
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-[#6b6861] uppercase tracking-wider block mb-1">
                  Department
                </label>
                <select
                  value={profileDepartment}
                  onChange={(e) => {
                    setProfileDepartment(e.target.value);
                    setProfileSection("");
                  }}
                  className="w-full h-9 rounded-lg border border-[#ebdcc9] bg-[#FAF6EE] text-xs px-2.5 outline-none focus:border-[#1a1917]"
                  required
                >
                  <option value="">Select department</option>
                  <option value="Computer Science & Engineering">Computer Science & Engineering</option>
                  <option value="Electronics & Communications">Electronics & Communications</option>
                  <option value="Electrical & Electronics Engineering">Electrical & Electronics Engineering</option>
                  <option value="Mechanical Engineering">Mechanical Engineering</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold text-[#6b6861] uppercase tracking-wider block mb-1">
                  Handled Sections (e.g. {getDeptPrefix(profileDepartment)}-A, {getDeptPrefix(profileDepartment)}-B)
                </label>
                <Input
                  type="text"
                  placeholder={`${getDeptPrefix(profileDepartment)}-A, ${getDeptPrefix(profileDepartment)}-B`}
                  value={profileSection}
                  onChange={(e) => setProfileSection(e.target.value)}
                  className="h-9 text-xs"
                  required
                />
                <p className="text-[10px] text-[#75716a] mt-1.5 italic">
                  * Multiple sections must be comma-separated, matching department prefix format.
                </p>
              </div>

              <Button type="submit" disabled={isUpdatingProfile} className="w-full h-9 text-xs font-semibold bg-[#1a1917] hover:bg-[#333] mt-2">
                {isUpdatingProfile ? "Saving Profile..." : "Verify & Unlock Communications"}
              </Button>
            </form>
          </motion.div>
        </div>
      )}

      {/* 1. Sidebar Panel */}
      <div className="w-72 bg-white/70 backdrop-blur-md rounded-2xl border border-[#ebdcc9]/50 flex flex-col p-4 shadow-sm select-none">
        <h3 className="text-base font-bold text-[#1a1917] mb-4 flex items-center gap-2">
          <MessageSquare className="size-4.5 text-[#8e8a80]" />
          Faculty Communications
        </h3>

        <div className="space-y-1.5 flex-1 overflow-y-auto pr-1">
          <button
            onClick={() => setActiveTab("announcements")}
            className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-semibold uppercase tracking-wider flex items-center justify-between transition-all ${
              activeTab === "announcements"
                ? "bg-[#1a1917] text-white"
                : "text-[#6b6760] hover:bg-[#FAF6EE]"
            }`}
          >
            📢 Announcements Center
          </button>

          <button
            onClick={() => setActiveTab("class")}
            className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-semibold uppercase tracking-wider flex items-center justify-between transition-all ${
              activeTab === "class"
                ? "bg-[#1a1917] text-white"
                : "text-[#6b6760] hover:bg-[#FAF6EE]"
            }`}
          >
            🏫 Class Group Chats
          </button>

          {/* Student request queue tracker */}
          <button
            onClick={() => setActiveTab("requests")}
            className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-semibold uppercase tracking-wider flex items-center justify-between transition-all ${
              activeTab === "requests"
                ? "bg-[#1a1917] text-white"
                : "text-[#6b6760] hover:bg-[#FAF6EE]"
            }`}
          >
            📥 Student Chat Requests
            {requests.filter((r) => r.status === "pending").length > 0 && (
              <span className="size-4.5 rounded-full bg-amber-500 text-[10px] text-white font-bold flex items-center justify-center shrink-0">
                {requests.filter((r) => r.status === "pending").length}
              </span>
            )}
          </button>

          {/* Direct chats list */}
          <div className="pt-4">
            <span className="text-[10px] font-bold text-[#8e8a80] px-3 uppercase tracking-wider block mb-2">
              Approved Direct Chats
            </span>
            <div className="space-y-1">
              {contacts.length === 0 ? (
                <div className="text-[11px] text-[#8e8a80] px-3 py-2 italic">
                  No active student chats.
                </div>
              ) : (
                contacts.map((contact) => {
                  const isSelected = activeTab === "dm" && activeDmRecipient?.id === contact.id;
                  const isOnline = onlineUsers.has(contact.id);
                  return (
                    <button
                      key={contact.id}
                      onClick={() => {
                        setActiveDmRecipient(contact);
                        setActiveTab("dm");
                      }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs transition-all text-left ${
                        isSelected
                          ? "bg-[#FAF6EE] border-l-3 border-[#1a1917] font-semibold text-[#1a1917]"
                          : "text-[#6b6760] hover:bg-[#FAF6EE]"
                      }`}
                    >
                      <div className="relative">
                        <div className="size-6.5 rounded-full bg-[#ebdcc9] flex items-center justify-center font-bold text-[10px] uppercase text-[#1a1917]">
                          {contact.name.slice(0, 2)}
                        </div>
                        <span className={`absolute bottom-0 right-0 size-2 rounded-full border border-white ${isOnline ? "bg-emerald-500" : "bg-neutral-300"}`} />
                      </div>
                      <div className="truncate flex-1">
                        <div className="font-semibold truncate text-[#1a1917]">{contact.name}</div>
                        <div className="text-[10px] text-[#8e8a80] truncate">Roll: {contact.rollNumber || "Student"}</div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 2. Main Chat Panel */}
      <div className="flex-1 bg-white/70 backdrop-blur-md rounded-2xl border border-[#ebdcc9]/50 flex flex-col shadow-sm overflow-hidden">
        
        {activeTab === "announcements" ? (
          // Announcements broadcast view
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Header */}
            <div className="h-14 border-b border-[#ebdcc9]/40 bg-white/40 px-5 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="size-8 rounded-full bg-[#FAF6EE] flex items-center justify-center text-sm">📢</div>
                <div>
                  <div className="text-xs font-bold text-[#1a1917]">Announcements Board</div>
                  <div className="text-[9px] text-[#8e8a80]">Broadcast official campus notices</div>
                </div>
              </div>
            </div>

            {/* Content area: list of announcements + composer */}
            <div className="flex-1 flex gap-5 p-5 overflow-hidden">
              {/* Timeline list */}
              <div className="flex-1 bg-white/40 rounded-2xl border border-[#ebdcc9]/30 flex flex-col overflow-hidden p-4">
                <span className="text-[11px] font-bold text-[#8e8a80] uppercase tracking-wider block mb-3">Announcement Feed</span>
                <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                  {messages.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-xs text-[#8e8a80] italic">
                      No announcements posted.
                    </div>
                  ) : (
                    messages.map((ann) => (
                      <div key={ann.id} className="bg-white p-3.5 rounded-2xl border border-[#ebdcc9]/25 shadow-sm">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold text-[#1a1917] flex items-center gap-1.5">
                            {ann.senderName}
                            <span className={`px-1.5 py-0.2 rounded text-[7.5px] font-extrabold border uppercase ${
                              ann.senderRole === "faculty" || ann.senderRole === "admin"
                                ? "bg-indigo-50 border-indigo-200 text-indigo-700"
                                : "bg-emerald-50 border-emerald-200 text-emerald-700"
                            }`}>
                              {ann.senderRole === "faculty" || ann.senderRole === "admin" ? "Faculty" : "Student"}
                            </span>
                          </span>
                          <span className="text-[9px] text-[#8e8a80]">
                            {new Date(ann.createdAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
                          </span>
                        </div>
                        <div className="text-xs leading-[1.4] text-[#1a1917]">{ann.content}</div>
                        {ann.attachments && ann.attachments.length > 0 && (
                          <div className="mt-3 pt-2.5 border-t border-dashed border-[#ebdcc9]/40 flex gap-2">
                            {ann.attachments.map((file: string, index: number) => (
                              <div key={index} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#FAF6EE] text-[10px] text-[#1a1917] font-semibold border border-[#ebdcc9]/45">
                                <FileText className="size-3.5 text-[#8e8a80]" />
                                <span>{file}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Broadcast Composer */}
              <div className="w-80 bg-white/80 rounded-2xl border border-[#ebdcc9]/35 p-4 flex flex-col justify-between shrink-0 shadow-sm">
                <form onSubmit={handlePostAnnouncement} className="space-y-4 flex-1 flex flex-col justify-between">
                  <div className="space-y-3.5">
                    <span className="text-[11px] font-bold text-[#8e8a80] uppercase tracking-wider block mb-1">Broadcast Announcement</span>
                    
                    <div>
                      <label className="text-[10px] font-bold text-[#8e8a80] uppercase tracking-wider block mb-1">Target Audience</label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setAnnTarget("college")}
                          className={`h-8 rounded-lg text-[10px] font-bold border transition-all ${
                            annTarget === "college"
                              ? "bg-[#1a1917] text-white border-transparent"
                              : "bg-[#FAF6EE] text-[#6b6760] border-[#ebdcc9]"
                          }`}
                        >
                          📢 Entire College
                        </button>
                        <button
                          type="button"
                          onClick={() => setAnnTarget("class")}
                          className={`h-8 rounded-lg text-[10px] font-bold border transition-all ${
                            annTarget === "class"
                              ? "bg-[#1a1917] text-white border-transparent"
                              : "bg-[#FAF6EE] text-[#6b6760] border-[#ebdcc9]"
                          }`}
                        >
                          🏫 Target Section
                        </button>
                      </div>
                    </div>

                    {annTarget === "class" && (
                      <div className="space-y-2.5 bg-[#FAF6EE]/60 p-3 rounded-xl border border-[#ebdcc9]/45">
                        <span className="text-[9px] font-bold text-[#8e8a80] uppercase tracking-wider block">Audience Filters</span>
                        <div className="grid grid-cols-2 gap-2">
                          <Input
                            placeholder="Sem 4"
                            value={selectedSem}
                            onChange={(e) => setSelectedSem(e.target.value)}
                            className="h-8 text-[10px] font-medium bg-white"
                          />
                          <Input
                            placeholder="Sec A"
                            value={selectedSec}
                            onChange={(e) => setSelectedSec(e.target.value)}
                            className="h-8 text-[10px] font-medium bg-white"
                          />
                        </div>
                        <select
                          value={selectedDept}
                          onChange={(e) => setSelectedDept(e.target.value)}
                          className="w-full h-8 rounded-lg border border-[#ebdcc9] bg-white text-[10px] font-medium px-2 outline-none"
                        >
                          <option value="Computer Science & Engineering">Computer Science & Engineering</option>
                          <option value="Electronics & Communications">Electronics & Communications</option>
                          <option value="Electrical & Electronics Engineering">Electrical & Electronics Engineering</option>
                          <option value="Mechanical Engineering">Mechanical Engineering</option>
                        </select>
                      </div>
                    )}

                    <div>
                      <label className="text-[10px] font-bold text-[#8e8a80] uppercase tracking-wider block mb-1">Announcement Message</label>
                      <Textarea
                        placeholder="Type announcement message here..."
                        value={annContent}
                        onChange={(e) => setAnnContent(e.target.value)}
                        className="text-xs min-h-[140px] resize-none"
                        required
                      />
                    </div>

                    {fileAttachment && (
                      <div className="flex items-center justify-between px-2.5 py-1 bg-[#FAF6EE] border border-[#ebdcc9]/40 rounded-lg text-[10px] text-[#1a1917] font-semibold">
                        <span className="truncate">{fileAttachment}</span>
                        <button type="button" onClick={() => setFileAttachment(null)} className="text-rose-500 hover:underline ml-2">Remove</button>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2 mt-4 pt-3 border-t border-[#ebdcc9]/30">
                    <button
                      type="button"
                      onClick={triggerMockUpload}
                      className="w-full h-8 border border-[#ebdcc9] rounded-lg text-[10px] font-semibold text-[#1a1917] hover:bg-[#FAF6EE] flex items-center justify-center gap-1 transition-colors"
                    >
                      <Paperclip className="size-3.5" />
                      Attach Document
                    </button>
                    <Button
                      type="submit"
                      disabled={isSendingAnn}
                      className="w-full h-9 text-xs font-semibold bg-[#1a1917] hover:bg-[#333]"
                    >
                      <Megaphone className="size-3.5 mr-1" />
                      {isSendingAnn ? "Broadcasting..." : "Broadcast Announcement"}
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        ) : activeTab === "requests" ? (
          // Requests Queue panel
          <div className="flex-1 flex flex-col p-5 overflow-y-auto">
            <h4 className="text-sm font-bold text-[#1a1917] mb-2 flex items-center gap-2">
              <Megaphone className="size-4.5 text-amber-500" />
              Incoming Student Chat Requests
            </h4>
            <p className="text-[11px] text-[#8e8a80] mb-5">
              Below are private conversation requests from students. Approve requests to open a secure direct-messaging communication channel.
            </p>

            <div className="space-y-4">
              {requests.filter((r) => r.status === "pending").length === 0 ? (
                <div className="text-center py-10 bg-white/40 rounded-2xl border border-[#ebdcc9]/30 text-xs text-[#8e8a80] italic">
                  No pending chat requests.
                </div>
              ) : (
                requests
                  .filter((r) => r.status === "pending")
                  .map((request) => (
                    <div
                      key={request.id}
                      className="bg-white p-4 rounded-2xl border border-[#ebdcc9]/40 shadow-sm flex flex-col md:flex-row justify-between md:items-center gap-4"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2.5">
                          <div className="size-7.5 rounded-full bg-[#FAF6EE] flex items-center justify-center text-xs font-bold text-[#1a1917]">
                            🎓
                          </div>
                          <div>
                            <span className="text-xs font-bold text-[#1a1917]">
                              {request.student.name}
                            </span>
                            <span className="text-[9.5px] text-[#8e8a80] ml-2">
                              Roll: {request.student.rollNumber || "N/A"}
                            </span>
                          </div>
                        </div>
                        <div className="text-[10px] text-[#8e8a80] px-10">
                          {request.student.department} • Section {request.student.section || "N/A"}
                        </div>
                        <div className="mt-3 text-xs">
                          <div className="font-semibold text-[#1a1917] mt-2">Subject: {request.subject}</div>
                          <p className="text-[#6b6760] mt-0.5 leading-relaxed bg-[#FAF8F5] p-2 rounded-xl border border-[#ebdcc9]/20">
                            {request.reason}
                          </p>
                        </div>
                        {request.attachment && (
                          <div className="mt-2 pl-10 flex items-center gap-1.5 text-[10px] text-indigo-600 font-semibold cursor-pointer hover:underline">
                            <FileText className="size-3.5" />
                            <span>Attachment: {request.attachment}</span>
                          </div>
                        )}
                      </div>

                      <div className="flex gap-2 shrink-0 md:self-end">
                        <button
                          onClick={() => handleRequestAction(request.id, "reject")}
                          className="h-8 px-3 rounded-lg border border-rose-200 text-rose-600 bg-rose-50/50 hover:bg-rose-50 text-[11px] font-semibold flex items-center gap-1 transition-colors"
                        >
                          <X className="size-3.5" />
                          Decline
                        </button>
                        <button
                          onClick={() => handleRequestAction(request.id, "approve")}
                          className="h-8 px-3.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold flex items-center gap-1 transition-colors shadow-sm"
                        >
                          <Check className="size-3.5" />
                          Approve Request
                        </button>
                      </div>
                    </div>
                  ))
              )}
            </div>
          </div>
        ) : activeTab === "class" ? (
          // Class Chat tab
          <>
            {/* Room selection filters */}
            <div className="bg-white/50 border-b border-[#ebdcc9]/40 p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2">
                <span className="size-6 text-center text-xs">🏫</span>
                <span className="text-xs font-bold text-[#1a1917]">Class Discussion Selector</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <select
                  value={selectedDept}
                  onChange={(e) => setSelectedDept(e.target.value)}
                  className="h-8 rounded-lg border border-[#ebdcc9] bg-white text-[10px] font-semibold px-2 outline-none"
                >
                  <option value="Computer Science & Engineering">CSE Department</option>
                  <option value="Electronics & Communications">ECE Department</option>
                  <option value="Electrical & Electronics Engineering">EEE Department</option>
                  <option value="Mechanical Engineering">Mech Department</option>
                </select>
                <Input
                  value={selectedSem}
                  onChange={(e) => setSelectedSem(e.target.value)}
                  placeholder="Semester 4"
                  className="h-8 w-24 text-[10px] bg-white border-[#ebdcc9]"
                />
                <Input
                  value={selectedSec}
                  onChange={(e) => setSelectedSec(e.target.value)}
                  placeholder="Sec A"
                  className="h-8 w-18 text-[10px] bg-white border-[#ebdcc9]"
                />
              </div>
            </div>

            {/* Chat Timeline */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-[#FAF8F5]/30">
              <div className="text-center py-2 bg-[#FAF6EE] border border-[#ebdcc9]/30 rounded-xl max-w-md mx-auto text-[10px] text-[#8e8a80] font-semibold">
                🎓 Discussion room: {selectedDept} • {selectedSem} • {selectedSec}
              </div>
              
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center p-4">
                  <div className="text-xs text-[#8e8a80] italic">No posts in this class chat. Start the discussion!</div>
                </div>
              ) : (
                messages.map((msg) => {
                  const isMe = msg.senderId === profile?.id;
                  const reactionsArray = msg.reactions || [];
                  const hasReactions = reactionsArray.length > 0;
                  const isPinned = !!msg.isPinned;
                  const isDeleted = !!msg.isDeleted;
                  const readByArray = msg.readBy || [];

                  return (
                    <div
                      key={msg.id}
                      className={`flex items-start gap-2.5 ${isMe ? "justify-end" : "justify-start"} group relative`}
                    >
                      {!isMe && (
                        <div className="size-6.5 rounded-full bg-[#ebdcc9] flex items-center justify-center text-[9px] font-bold uppercase text-[#1a1917] mt-0.5 shrink-0">
                          {msg.senderName.slice(0, 2)}
                        </div>
                      )}
                      <div className={`flex flex-col max-w-[70%] ${isMe ? "items-end" : "items-start"} relative`}>
                        {!isMe && (
                          <span className="text-[9px] font-bold text-[#8e8a80] mb-0.5 px-1 flex items-center gap-1.5">
                            {msg.senderName}
                            <span className={`px-1.5 py-0.2 rounded text-[7.5px] font-extrabold border uppercase ${
                              msg.senderRole === "faculty" || msg.senderRole === "admin"
                                ? "bg-indigo-50 border-indigo-200 text-indigo-700"
                                : "bg-emerald-50 border-emerald-200 text-emerald-700"
                            }`}>
                              {msg.senderRole === "faculty" || msg.senderRole === "admin" ? "Faculty" : "Student"}
                            </span>
                          </span>
                        )}

                        {isPinned && (
                          <span className="text-[8.5px] font-bold text-amber-600 flex items-center gap-0.5 mb-0.5 px-1">
                            📌 Pinned Message
                          </span>
                        )}

                        {msg.forwardedFrom && (
                          <span className="text-[8.5px] font-semibold text-zinc-400 italic mb-0.5 px-1">
                            Forwarded from {msg.forwardedFrom}
                          </span>
                        )}

                        <div className="relative">
                          <div
                            className={`p-3 rounded-2xl text-xs leading-[1.4] shadow-sm ${
                              isMe
                                ? "bg-[#1a1917] text-white rounded-tr-none"
                                : "bg-white text-[#1a1917] border border-[#ebdcc9]/30 rounded-tl-none"
                            } ${isDeleted ? "italic text-zinc-400 border-dashed" : ""}`}
                          >
                            <div>{msg.content}</div>
                            {msg.attachments && msg.attachments.length > 0 && (
                              <div className="mt-2 pt-2 border-t border-dashed border-[#ebdcc9]/20">
                                {msg.attachments.map((file: string, idx: number) => (
                                  <div key={idx} className="flex items-center gap-1.5 text-[10px] opacity-90 hover:underline cursor-pointer">
                                    <FileText className="size-3" />
                                    <span>{file}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Hover Actions Menu */}
                          {!isDeleted && (
                            <div className="absolute top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-white border border-[#ebdcc9] shadow-md rounded-xl p-1 flex items-center gap-1 z-10 shrink-0 scale-90 origin-right duration-250"
                              style={{ [isMe ? "left" : "right"]: "-110px" }}
                            >
                              {["👍", "❤️", "😂", "🔥", "🎉"].map((emoji) => (
                                <button
                                  key={emoji}
                                  type="button"
                                  onClick={() => handleReactToMessage(msg.id, emoji)}
                                  className="hover:scale-125 transition-transform p-0.5 text-xs cursor-pointer"
                                >
                                  {emoji}
                                </button>
                              ))}
                              <button
                                key={msg.id + "-pin"}
                                type="button"
                                onClick={() => handleTogglePin(msg.id)}
                                className="text-[10px] text-zinc-500 hover:text-zinc-900 px-0.5 hover:scale-110 cursor-pointer"
                                title="Pin Message"
                              >
                                📌
                              </button>
                              {isMe && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteMessage(msg.id, "everyone")}
                                  className="text-[10px] text-rose-500 hover:text-rose-700 px-0.5 hover:scale-110 cursor-pointer"
                                  title="Delete for Everyone"
                                >
                                  🗑️
                                </button>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Reactions list badges */}
                        {hasReactions && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {reactionsArray.map((react: any, idx: number) => (
                              <span
                                key={idx}
                                className="px-1.5 py-0.5 bg-[#FAF6EE] border border-[#ebdcc9] rounded-full text-[9px] flex items-center gap-1 font-bold text-zinc-700"
                                title={`Reacted by ${react.userName}`}
                              >
                                <span>{react.emoji}</span>
                                <span className="text-[7.5px] opacity-75 font-mono">1</span>
                              </span>
                            ))}
                          </div>
                        )}

                        <div className="flex items-center gap-1 mt-1 px-1">
                          <span className="text-[8px] text-[#8e8a80]">
                            {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                          {isMe && activeTab === "dm" && (
                            <span className="ml-1">
                              {readByArray.length > 1 ? (
                                <CheckCheck className="size-3 text-indigo-500 font-extrabold" />
                              ) : (
                                <CheckCheck className="size-3 text-zinc-300" />
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}

              {/* Partner Typing */}
              {partnerTyping && (
                <div className="flex items-center gap-2 text-[10px] text-[#8e8a80] px-9 italic">
                  <Clock className="size-3 animate-spin" />
                  {partnerTyping} is typing...
                </div>
              )}
              
              <div ref={chatEndRef} />
            </div>

            {/* Input Composer */}
            <form onSubmit={handleSendMessage} className="p-3 bg-white/40 border-t border-[#ebdcc9]/40 flex flex-col gap-2.5 shrink-0">
              {fileAttachment && (
                <div className="flex items-center justify-between px-3 py-1.5 bg-[#FAF6EE] border border-[#ebdcc9]/40 rounded-xl text-xs text-[#1a1917]">
                  <div className="flex items-center gap-1.5 font-medium">
                    <FileText className="size-3 text-[#8e8a80]" />
                    <span>{fileAttachment}</span>
                  </div>
                  <button type="button" onClick={() => setFileAttachment(null)} className="text-[10px] text-rose-500 hover:underline font-bold">Remove</button>
                </div>
              )}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={triggerMockUpload}
                  className="p-2 text-[#8e8a80] hover:text-[#1a1917] rounded-xl hover:bg-[#FAF6EE] transition-colors"
                >
                  <Paperclip className="size-4.5" />
                </button>
                <Input
                  type="text"
                  placeholder="Post assignment, notes, or discussion..."
                  value={messageText}
                  onChange={handleInputChange}
                  className="flex-1 h-10 border-[#ebdcc9]/60 focus:border-[#1a1917]"
                />
                <Button type="submit" className="h-10 px-4 bg-[#1a1917] hover:bg-[#333] rounded-xl shrink-0 shadow-sm">
                  <Send className="size-4 text-white" />
                </Button>
              </div>
            </form>
          </>
        ) : (
          // 4. Direct Messages panel
          <>
            {/* Header */}
            <div className="h-14 border-b border-[#ebdcc9]/40 bg-white/40 px-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="size-8.5 rounded-full bg-[#ebdcc9] flex items-center justify-center font-bold text-xs uppercase text-[#1a1917]">
                  {activeDmRecipient?.name.slice(0, 2)}
                </div>
                <div>
                  <div className="text-xs font-bold text-[#1a1917]">{activeDmRecipient?.name}</div>
                  <div className="text-[9px] text-[#8e8a80]">
                    Student • {activeDmRecipient?.department} (Sec {activeDmRecipient?.section || "N/A"})
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleCloseConversation(activeDmRecipient.id)}
                  className="h-8 px-3 rounded-lg border border-rose-200 text-rose-600 bg-rose-50/50 hover:bg-rose-50 text-[10.5px] font-bold flex items-center gap-1.5 transition-colors"
                >
                  <Lock className="size-3.5" />
                  Close Conversation
                </button>
              </div>
            </div>

            {/* Chat Timeline */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-[#FAF8F5]/30">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center p-4">
                  <div className="text-xs text-[#8e8a80]">No messages yet. Send a message to start private chat.</div>
                </div>
              ) : (
                messages.map((msg) => {
                  const isMe = msg.senderId === profile?.id;
                  const reactionsArray = msg.reactions || [];
                  const hasReactions = reactionsArray.length > 0;
                  const isPinned = !!msg.isPinned;
                  const isDeleted = !!msg.isDeleted;
                  const readByArray = msg.readBy || [];

                  return (
                    <div
                      key={msg.id}
                      className={`flex items-start gap-2.5 ${isMe ? "justify-end" : "justify-start"} group relative`}
                    >
                      {!isMe && (
                        <div className="size-6.5 rounded-full bg-[#ebdcc9] flex items-center justify-center text-[9px] font-bold uppercase text-[#1a1917] mt-0.5 shrink-0">
                          {msg.senderName.slice(0, 2)}
                        </div>
                      )}
                      <div className={`flex flex-col max-w-[70%] ${isMe ? "items-end" : "items-start"} relative`}>
                        {isPinned && (
                          <span className="text-[8.5px] font-bold text-amber-600 flex items-center gap-0.5 mb-0.5 px-1">
                            📌 Pinned Message
                          </span>
                        )}

                        {msg.forwardedFrom && (
                          <span className="text-[8.5px] font-semibold text-zinc-400 italic mb-0.5 px-1">
                            Forwarded from {msg.forwardedFrom}
                          </span>
                        )}

                        <div className="relative">
                          <div
                            className={`p-3 rounded-2xl text-xs leading-[1.4] shadow-sm ${
                              isMe
                                ? "bg-[#1a1917] text-white rounded-tr-none"
                                : "bg-white text-[#1a1917] border border-[#ebdcc9]/30 rounded-tl-none"
                            } ${isDeleted ? "italic text-zinc-400 border-dashed" : ""}`}
                          >
                            <div>{msg.content}</div>
                            {msg.attachments && msg.attachments.length > 0 && (
                              <div className="mt-2 pt-2 border-t border-dashed border-[#ebdcc9]/25">
                                {msg.attachments.map((file: string, idx: number) => (
                                  <div key={idx} className="flex items-center gap-1.5 text-[10px] opacity-90 hover:underline cursor-pointer">
                                    <FileText className="size-3" />
                                    <span>{file}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Hover Actions Menu */}
                          {!isDeleted && (
                            <div className="absolute top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-white border border-[#ebdcc9] shadow-md rounded-xl p-1 flex items-center gap-1 z-10 shrink-0 scale-90 origin-right duration-250"
                              style={{ [isMe ? "left" : "right"]: "-110px" }}
                            >
                              {["👍", "❤️", "😂", "🔥", "🎉"].map((emoji) => (
                                <button
                                  key={emoji}
                                  type="button"
                                  onClick={() => handleReactToMessage(msg.id, emoji)}
                                  className="hover:scale-125 transition-transform p-0.5 text-xs cursor-pointer"
                                >
                                  {emoji}
                                </button>
                              ))}
                              <button
                                key={msg.id + "-pin"}
                                type="button"
                                onClick={() => handleTogglePin(msg.id)}
                                className="text-[10px] text-zinc-500 hover:text-zinc-900 px-0.5 hover:scale-110 cursor-pointer"
                                title="Pin Message"
                              >
                                📌
                              </button>
                              {isMe && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteMessage(msg.id, "everyone")}
                                  className="text-[10px] text-rose-500 hover:text-rose-700 px-0.5 hover:scale-110 cursor-pointer"
                                  title="Delete for Everyone"
                                >
                                  🗑️
                                </button>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Reactions list badges */}
                        {hasReactions && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {reactionsArray.map((react: any, idx: number) => (
                              <span
                                key={idx}
                                className="px-1.5 py-0.5 bg-[#FAF6EE] border border-[#ebdcc9] rounded-full text-[9px] flex items-center gap-1 font-bold text-zinc-700"
                                title={`Reacted by ${react.userName}`}
                              >
                                <span>{react.emoji}</span>
                                <span className="text-[7.5px] opacity-75 font-mono">1</span>
                              </span>
                            ))}
                          </div>
                        )}

                        <div className="flex items-center gap-1 mt-1 px-1">
                          <span className="text-[8px] text-[#8e8a80]">
                            {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                          {isMe && activeTab === "dm" && (
                            <span className="ml-1">
                              {readByArray.length > 1 ? (
                                <CheckCheck className="size-3 text-indigo-500 font-extrabold" />
                              ) : (
                                <CheckCheck className="size-3 text-zinc-300" />
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}

              {partnerTyping && (
                <div className="flex items-center gap-2 text-[10px] text-[#8e8a80] px-9 italic">
                  <Clock className="size-3 animate-spin" />
                  {partnerTyping} is typing...
                </div>
              )}
              
              <div ref={chatEndRef} />
            </div>

            {/* Input Composer */}
            <form onSubmit={handleSendMessage} className="p-3 bg-white/40 border-t border-[#ebdcc9]/40 flex flex-col gap-2.5 shrink-0">
              {fileAttachment && (
                <div className="flex items-center justify-between px-3 py-1.5 bg-[#FAF6EE] border border-[#ebdcc9]/40 rounded-xl text-xs text-[#1a1917]">
                  <div className="flex items-center gap-1.5 font-medium">
                    <FileText className="size-3 text-[#8e8a80]" />
                    <span>{fileAttachment}</span>
                  </div>
                  <button type="button" onClick={() => setFileAttachment(null)} className="text-[10px] text-rose-500 hover:underline font-bold">Remove</button>
                </div>
              )}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={triggerMockUpload}
                  className="p-2 text-[#8e8a80] hover:text-[#1a1917] rounded-xl hover:bg-[#FAF6EE] transition-colors"
                >
                  <Paperclip className="size-4.5" />
                </button>
                <Input
                  type="text"
                  placeholder="Send direct message..."
                  value={messageText}
                  onChange={handleInputChange}
                  className="flex-1 h-10 border-[#ebdcc9]/60 focus:border-[#1a1917]"
                />
                <Button type="submit" className="h-10 px-4 bg-[#1a1917] hover:bg-[#333] rounded-xl shrink-0 shadow-sm">
                  <Send className="size-4 text-white" />
                </Button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
