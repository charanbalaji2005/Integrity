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
  Plus,
  AlertCircle,
  FileText,
  Search,
  Clock,
  CheckCheck,
  Building,
  UserCheck,
  UserPlus,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";

export function StudentMessagingView() {
  const { profile, refreshProfile } = useProfile();
  const [socket, setSocket] = useState<Socket | null>(null);

  // Active Chats & Navigation
  const [activeTab, setActiveTab] = useState<"college" | "class" | "faculty" | "dm">("college");
  const [activeDmRecipient, setActiveDmRecipient] = useState<any | null>(null);
  
  // Data States
  const [messages, setMessages] = useState<any[]>([]);
  const [facultyList, setFacultyList] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  
  // UI states
  const [messageText, setMessageText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [partnerTyping, setPartnerTyping] = useState<string | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  
  // Request Modal State
  const [selectedFaculty, setSelectedFaculty] = useState<any | null>(null);
  const [requestSubject, setRequestSubject] = useState("");
  const [requestReason, setRequestReason] = useState("");
  const [requestAttachment, setRequestAttachment] = useState<string | null>(null);
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);

  // Profile Update Form
  const [profileName, setProfileName] = useState("");
  const [profileSection, setProfileSection] = useState("");
  const [profileSemester, setProfileSemester] = useState("");
  const [profileDepartment, setProfileDepartment] = useState("");
  const [profileDegree, setProfileDegree] = useState("B.Tech");
  const [showSectionFormatsModal, setShowSectionFormatsModal] = useState(false);
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);

  useEffect(() => {
    if (profile) {
      setProfileName(profile.name || "");
      setProfileDepartment(profile.department || "");
      setProfileSection(profile.section || "");
      setProfileSemester(profile.semester || "");
      setProfileDegree(profile.branch || "B.Tech");
    }
  }, [profile]);

  const getDeptPrefix = (dept: string) => {
    if (dept === "Computer Science & Engineering") return "CSE";
    if (dept === "Electronics & Communications") return "ECE";
    if (dept === "Electrical & Electronics Engineering") return "EEE";
    if (dept === "Mechanical Engineering") return "MEC";
    return "CSE";
  };

  // File upload state (mock)
  const [fileAttachment, setFileAttachment] = useState<string | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Get Room ID based on state
  const getActiveRoomId = (): string => {
    if (activeTab === "college") return "college";
    if (activeTab === "class" && profile?.department && profile?.semester && profile?.section) {
      return `class:${profile.department}:${profile.semester}:${profile.section}`;
    }
    if (activeTab === "dm" && activeDmRecipient && profile) {
      // sort IDs for unique room between user and recipient
      const ids = [profile.id, activeDmRecipient.id].sort();
      return `private:${ids[0]}-${ids[1]}`;
    }
    return "";
  };

  // Socket Connection setup
  useEffect(() => {
    if (!profile) return;

    // Connect to WebSocket server directly
    const socketInstance = io("http://localhost:5050", {
      auth: {
        userId: profile.id,
        userRole: "user",
      },
    });

    socketInstance.on("connect", () => {
      console.log("[Socket] Connected to Socket.IO Server");
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
  }, [profile?.id, activeTab, activeDmRecipient?.id]);

  // Join/Leave Rooms on tab/DM change
  useEffect(() => {
    if (!socket || !profile) return;
    const roomId = getActiveRoomId();
    if (!roomId) return;

    socket.emit("join-room", roomId);

    return () => {
      socket.emit("leave-room", roomId);
      setPartnerTyping(null);
    };
  }, [socket, activeTab, activeDmRecipient?.id, profile?.section, profile?.department]);

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
        let url = `/api/chat/messages?type=${activeTab}`;
        if (activeTab === "class") {
          url += `&department=${encodeURIComponent(profile.department || "")}&semester=${encodeURIComponent(profile.semester || "")}&section=${encodeURIComponent(profile.section || "")}`;
        } else if (activeTab === "dm" && activeDmRecipient) {
          url += `&recipientId=${activeDmRecipient.id}`;
        }
        const res = await fetch(url, {
          headers: { "x-user-id": profile.id, "x-user-role": "user" },
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
  }, [activeTab, activeDmRecipient?.id, profile?.section, profile?.department]);

  // Fetch lists (Faculty directory, Requests queue, DM Contacts)
  const fetchLists = async () => {
    if (!profile) return;
    try {
      // 1. Fetch Faculty list
      const facRes = await fetch("/api/chat/faculty", {
        headers: { "x-user-id": profile.id, "x-user-role": "user" },
      });
      if (facRes.ok) {
        const facData = await facRes.json();
        setFacultyList(facData.data || []);
      }

      // 2. Fetch Requests
      const reqRes = await fetch("/api/chat/requests", {
        headers: { "x-user-id": profile.id, "x-user-role": "user" },
      });
      if (reqRes.ok) {
        const reqData = await reqRes.json();
        setRequests(reqData.data || []);
      }

      // 3. Fetch Contacts
      const conRes = await fetch("/api/chat/contacts", {
        headers: { "x-user-id": profile.id, "x-user-role": "user" },
      });
      if (conRes.ok) {
        const conData = await conRes.json();
        setContacts(conData.data || []);
      }
    } catch (err) {
      console.error("Failed to fetch lists:", err);
    }
  };

  useEffect(() => {
    fetchLists();
  }, [profile?.id, activeTab]);

  // Scroll to bottom of chat
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
          "x-user-role": "user"
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
          "x-user-role": "user"
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
          "x-user-role": "user"
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
        const payload: any = { type: activeTab };
        if (activeTab === "class") {
          payload.department = profile.department;
          payload.semester = profile.semester;
          payload.section = profile.section;
        } else if (activeTab === "dm" && activeDmRecipient) {
          payload.recipientId = activeDmRecipient.id;
        }
        await fetch("/api/chat/messages/read", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-user-id": profile.id,
            "x-user-role": "user"
          },
          body: JSON.stringify(payload)
        });
      } catch (err) {
        console.error("Failed to mark messages as read:", err);
      }
    };
    markAsRead();
  }, [messages.length, activeTab, activeDmRecipient?.id]);

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
      type: activeTab,
      roomId,
    };

    if (activeTab === "class") {
      payload.department = profile.department;
      payload.semester = profile.semester;
      payload.section = profile.section;
    } else if (activeTab === "dm" && activeDmRecipient) {
      payload.recipientId = activeDmRecipient.id;
    }

    if (fileAttachment) {
      payload.attachments = [fileAttachment];
    }

    socket.emit("send-message", payload);

    // Stop typing indicator
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

  // Handle typing state
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

  // Submit profile details (to unlock Class Chat)
  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !profileName.trim() || !profileSection || !profileSemester || !profileDepartment) {
      toast.error("Please fill in all details.");
      return;
    }

    const formattedSection = profileSection.trim().toUpperCase();
    const prefix = getDeptPrefix(profileDepartment);
    const regex = new RegExp(`^${prefix}-[A-Z]$`);
    if (!regex.test(formattedSection)) {
      toast.error(`Invalid section format. Section must match format: ${prefix}-A, ${prefix}-B, etc.`);
      return;
    }

    setIsUpdatingProfile(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": profile.id,
          "x-user-role": "user",
        },
        body: JSON.stringify({
          name: profileName.trim(),
          section: formattedSection,
          semester: profileSemester,
          department: profileDepartment,
          branch: profileDegree,
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

  // Request Chat with Faculty
  const handleRequestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !selectedFaculty || !requestSubject.trim() || !requestReason.trim()) {
      toast.error("Please complete the form.");
      return;
    }

    setIsSubmittingRequest(true);
    try {
      const res = await fetch("/api/chat/requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": profile.id,
          "x-user-role": "user",
        },
        body: JSON.stringify({
          facultyId: selectedFaculty.id,
          subject: requestSubject,
          reason: requestReason,
          attachment: requestAttachment || null,
        }),
      });

      if (res.ok) {
        toast.success("Chat request sent successfully!");
        setSelectedFaculty(null);
        setRequestSubject("");
        setRequestReason("");
        setRequestAttachment(null);
        fetchLists();
      } else {
        const errData = await res.json().catch(() => ({}));
        toast.error(errData.message || "Failed to send request.");
      }
    } catch (err) {
      toast.error("Error sending request.");
    } finally {
      setIsSubmittingRequest(false);
    }
  };

  // Mock Upload attachment
  const triggerMockUpload = () => {
    const names = ["assignment_reference.pdf", "lab_doubt.png", "question_screenshot.jpg", "syllabus_query.docx"];
    const randomFile = names[Math.floor(Math.random() * names.length)];
    setFileAttachment(randomFile);
    toast.success(`Attached file: ${randomFile}`);
  };

  // Helper for requests status mapping
  const getRequestStatus = (facultyId: string) => {
    const match = requests.find((r) => r.facultyId === facultyId);
    return match ? match.status : null;
  };

  const isProfileIncomplete = !profile?.name || !profile?.department || !profile?.section || !profile?.semester || !profile?.branch;

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
              🎓 Complete Your Student Profile
            </h4>
            <p className="text-xs text-[#6b6861] mt-1">
              Please complete your academic profile details using the correct formats before proceeding to Student Communications.
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
                  Program / Degree
                </label>
                <select
                  value={profileDegree}
                  onChange={(e) => {
                    setProfileDegree(e.target.value);
                    setProfileSemester("");
                  }}
                  className="w-full h-9 rounded-lg border border-[#ebdcc9] bg-[#FAF6EE] text-xs px-2.5 outline-none focus:border-[#1a1917]"
                  required
                >
                  <option value="B.Tech">B.Tech (8 Semesters)</option>
                  <option value="M.Tech">M.Tech (6 Semesters)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-[#6b6861] uppercase tracking-wider block mb-1">
                    Semester
                  </label>
                  <select
                    value={profileSemester}
                    onChange={(e) => setProfileSemester(e.target.value)}
                    className="w-full h-9 rounded-lg border border-[#ebdcc9] bg-[#FAF6EE] text-xs px-2.5 outline-none focus:border-[#1a1917]"
                    required
                  >
                    <option value="">Select</option>
                    {profileDegree === "B.Tech" ? (
                      [1, 2, 3, 4, 5, 6, 7, 8].map(s => (
                        <option key={s} value={`Semester ${s}`}>{s}</option>
                      ))
                    ) : (
                      [1, 2, 3, 4, 5, 6].map(s => (
                        <option key={s} value={`Semester ${s}`}>{s}</option>
                      ))
                    )}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-bold text-[#6b6861] uppercase tracking-wider block mb-1">
                    Section
                  </label>
                  <Input
                    type="text"
                    placeholder={`${getDeptPrefix(profileDepartment)}-A`}
                    value={profileSection}
                    onChange={(e) => setProfileSection(e.target.value)}
                    className="h-9 text-xs"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowSectionFormatsModal(true)}
                    className="text-[10px] text-indigo-600 hover:underline mt-1 font-semibold block text-left"
                  >
                    Section Formats Accepted
                  </button>
                </div>
              </div>

              <Button type="submit" disabled={isUpdatingProfile} className="w-full h-9 text-xs font-semibold bg-[#1a1917] hover:bg-[#333] mt-2">
                {isUpdatingProfile ? "Saving Profile..." : "Verify & Enter Portal"}
              </Button>
            </form>
          </motion.div>
        </div>
      )}

      {/* 1. Left Sidebar of Messages Section */}
      <div className="w-72 bg-white/70 backdrop-blur-md rounded-2xl border border-[#ebdcc9]/50 flex flex-col p-4 shadow-sm select-none">
        <h3 className="text-base font-bold text-[#1a1917] mb-4 flex items-center gap-2">
          <MessageSquare className="size-4.5 text-[#8e8a80]" />
          Inbox & Channels
        </h3>
        
        {/* Navigation Categories */}
        <div className="space-y-1.5 flex-1 overflow-y-auto pr-1">
          <button
            onClick={() => setActiveTab("college")}
            className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-semibold uppercase tracking-wider flex items-center justify-between transition-all ${
              activeTab === "college"
                ? "bg-[#1a1917] text-white"
                : "text-[#6b6760] hover:bg-[#FAF6EE]"
            }`}
          >
            📢 College Channel
          </button>
          
          <button
            onClick={() => setActiveTab("class")}
            className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-semibold uppercase tracking-wider flex items-center justify-between transition-all ${
              activeTab === "class"
                ? "bg-[#1a1917] text-white"
                : "text-[#6b6760] hover:bg-[#FAF6EE]"
            }`}
          >
            🏫 Class Group Chat
          </button>

          {/* Faculty directory request button */}
          <button
            onClick={() => setActiveTab("faculty")}
            className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-semibold uppercase tracking-wider flex items-center justify-between transition-all ${
              activeTab === "faculty"
                ? "bg-[#1a1917] text-white"
                : "text-[#6b6760] hover:bg-[#FAF6EE]"
            }`}
          >
            👥 Faculty Directory
          </button>

          {/* Direct Private Messages list */}
          <div className="pt-4">
            <span className="text-[10px] font-bold text-[#8e8a80] px-3 uppercase tracking-wider block mb-2">
              Direct Messages
            </span>
            <div className="space-y-1">
              {contacts.length === 0 ? (
                <div className="text-[11px] text-[#8e8a80] px-3 py-2 italic">
                  No approved chats. Request approval from Faculty.
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
                        <div className="text-[10px] text-[#8e8a80] truncate">{contact.department || "Faculty"}</div>
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
        
        {/* Render View: College/Class/DM Chat Panels */}
        {activeTab !== "faculty" ? (
          <>
            {/* Blocker: Class Chat with missing profile section */}
            {activeTab === "class" && (!profile?.section || !profile?.department) ? (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                <div className="p-4 bg-amber-500/10 text-amber-800 rounded-full mb-4">
                  <AlertCircle className="size-8" />
                </div>
                <h4 className="text-base font-bold text-[#1a1917]">Complete Your Profile</h4>
                <p className="text-xs text-[#6b6861] mt-1 max-w-sm">
                  You must set your Department, Year/Semester, and Section in order to access class-level group chat channels.
                </p>
                <form onSubmit={handleUpdateProfile} className="mt-6 space-y-3 w-80 text-left bg-white/80 p-5 rounded-2xl border border-[#ebdcc9]/40 shadow-sm">
                  <div>
                    <label className="text-[11px] font-bold text-[#6b6861] uppercase tracking-wider block mb-1">
                      Department
                    </label>
                    <select
                      value={profileDepartment}
                      onChange={(e) => {
                        setProfileDepartment(e.target.value);
                        setProfileSection(""); // Reset section when dept changes to update prefix
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
                      Program / Degree
                    </label>
                    <select
                      value={profileDegree}
                      onChange={(e) => {
                        setProfileDegree(e.target.value);
                        setProfileSemester(""); // Reset semester on program change
                      }}
                      className="w-full h-9 rounded-lg border border-[#ebdcc9] bg-[#FAF6EE] text-xs px-2.5 outline-none focus:border-[#1a1917]"
                      required
                    >
                      <option value="B.Tech">B.Tech (8 Semesters)</option>
                      <option value="M.Tech">M.Tech (6 Semesters)</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-bold text-[#6b6861] uppercase tracking-wider block mb-1">
                        Semester
                      </label>
                      <select
                        value={profileSemester}
                        onChange={(e) => setProfileSemester(e.target.value)}
                        className="w-full h-9 rounded-lg border border-[#ebdcc9] bg-[#FAF6EE] text-xs px-2.5 outline-none focus:border-[#1a1917]"
                        required
                      >
                        <option value="">Select</option>
                        {profileDegree === "B.Tech" ? (
                          [1, 2, 3, 4, 5, 6, 7, 8].map(s => (
                            <option key={s} value={`Semester ${s}`}>{s}</option>
                          ))
                        ) : (
                          [1, 2, 3, 4, 5, 6].map(s => (
                            <option key={s} value={`Semester ${s}`}>{s}</option>
                          ))
                        )}
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-[#6b6861] uppercase tracking-wider block mb-1">
                        Section
                      </label>
                      <Input
                        type="text"
                        placeholder={`${getDeptPrefix(profileDepartment)}-A`}
                        value={profileSection}
                        onChange={(e) => setProfileSection(e.target.value)}
                        className="h-9 text-xs"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowSectionFormatsModal(true)}
                        className="text-[10px] text-indigo-600 hover:underline mt-1 font-semibold block text-left"
                      >
                        Section Formats Accepted
                      </button>
                    </div>
                  </div>
                  <Button type="submit" disabled={isUpdatingProfile} className="w-full h-9 text-xs font-semibold bg-[#1a1917] hover:bg-[#333] mt-2">
                    {isUpdatingProfile ? "Updating..." : "Save & Access Chats"}
                  </Button>
                </form>
              </div>
            ) : (
              // Active Chat Timeline
              <>
                {/* Chat Header */}
                <div className="h-14 border-b border-[#ebdcc9]/40 bg-white/40 px-4 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="size-8 rounded-full bg-[#FAF6EE] flex items-center justify-center font-bold text-[#1a1917]">
                      {activeTab === "college" ? "📢" : activeTab === "class" ? "🏫" : "👤"}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-[#1a1917]">
                        {activeTab === "college"
                          ? "College Announcements"
                          : activeTab === "class"
                          ? `Class Group - Section ${profile?.section}`
                          : activeDmRecipient?.name}
                      </div>
                      <div className="text-[9px] text-[#8e8a80]">
                        {activeTab === "college"
                          ? "Official administrative notice board"
                          : activeTab === "class"
                          ? `${profile?.department}`
                          : onlineUsers.has(activeDmRecipient?.id)
                          ? "Online"
                          : "Offline"}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Timeline Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-[#FAF8F5]/30">
                  {messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center p-4">
                      <div className="text-xs text-[#8e8a80]">No messages in this chat yet.</div>
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
                                  <div className="mt-2 pt-2 border-t border-dashed border-white/20">
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

                  {/* Partner Typing Indicator */}
                  {partnerTyping && (
                    <div className="flex items-center gap-2 text-[10px] text-[#8e8a80] px-9 italic">
                      <Clock className="size-3 animate-spin" />
                      {partnerTyping} is typing...
                    </div>
                  )}

                  <div ref={chatEndRef} />
                </div>

                {/* Input panel */}
                {activeTab === "college" ? (
                  <div className="p-3 bg-white/40 border-t border-[#ebdcc9]/40 text-center text-[10.5px] text-[#8e8a80] font-medium select-none">
                    🔒 Only Administrators and Faculty members can post announcements to this channel.
                  </div>
                ) : (
                  <form onSubmit={handleSendMessage} className="p-3 bg-white/40 border-t border-[#ebdcc9]/40 flex flex-col gap-2.5">
                    {fileAttachment && (
                      <div className="flex items-center justify-between px-3 py-1.5 bg-[#FAF6EE] border border-[#ebdcc9]/40 rounded-xl text-xs text-[#1a1917]">
                        <div className="flex items-center gap-1.5 font-medium">
                          <FileText className="size-3 text-[#8e8a80]" />
                          <span>{fileAttachment}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setFileAttachment(null)}
                          className="text-[10px] text-rose-500 hover:underline font-bold"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={triggerMockUpload}
                        className="p-2 text-[#8e8a80] hover:text-[#1a1917] rounded-xl hover:bg-[#FAF6EE] transition-colors"
                        title="Attach Document"
                      >
                        <Paperclip className="size-4.5" />
                      </button>
                      <Input
                        type="text"
                        placeholder={activeTab === "class" ? "Message your class..." : "Send direct message..."}
                        value={messageText}
                        onChange={handleInputChange}
                        className="flex-1 h-10 border-[#ebdcc9]/60 focus:border-[#1a1917]"
                      />
                      <Button type="submit" className="h-10 px-4 bg-[#1a1917] hover:bg-[#333] rounded-xl shrink-0 shadow-sm">
                        <Send className="size-4 text-white" />
                      </Button>
                    </div>
                  </form>
                )}
              </>
            )}
          </>
        ) : (
          // 3. Faculty Directory View
          <div className="flex-1 flex flex-col p-5 overflow-y-auto">
            <h4 className="text-sm font-bold text-[#1a1917] mb-3">Faculty Directory</h4>
            <p className="text-[11px] text-[#8e8a80] mb-5">
              Direct private chats are restricted. Search for a faculty member below and click <b>Request Chat</b>. Once they review and accept your request, a direct chat channel will open in the DM sidebar list.
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {facultyList.length === 0 ? (
                <div className="col-span-2 text-center py-8 text-xs text-[#8e8a80] italic">
                  No faculty members found.
                </div>
              ) : (
                facultyList.map((faculty) => {
                  const reqStatus = getRequestStatus(faculty.id);
                  return (
                    <div
                      key={faculty.id}
                      className="bg-white/80 p-4 rounded-2xl border border-[#ebdcc9]/40 shadow-sm flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <div className="size-8.5 rounded-full bg-[#FAF6EE] flex items-center justify-center font-bold text-xs uppercase text-[#1a1917] border border-[#ebdcc9]/40">
                            {faculty.name.slice(0, 2)}
                          </div>
                          <div>
                            <div className="text-xs font-bold text-[#1a1917]">{faculty.name}</div>
                            <div className="text-[10px] text-[#8e8a80]">{faculty.department || "General Academy"}</div>
                          </div>
                        </div>
                        <div className="mt-3 text-[10px] text-[#6b6760] font-medium flex items-center gap-1">
                          📧 {faculty.email}
                        </div>
                      </div>

                      <div className="mt-4 pt-3 border-t border-[#ebdcc9]/30 flex items-center justify-between">
                        {reqStatus === null ? (
                          <Button
                            onClick={() => setSelectedFaculty(faculty)}
                            className="h-8 text-[11px] font-semibold bg-[#1a1917] hover:bg-[#333]"
                          >
                            <UserPlus className="size-3.5 mr-1" />
                            Request Chat
                          </Button>
                        ) : reqStatus === "pending" ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-600 border border-amber-500/20">
                            <Clock className="size-3" />
                            Pending approval
                          </span>
                        ) : reqStatus === "approved" ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                            <UserCheck className="size-3" />
                            Approved (Available in DMs)
                          </span>
                        ) : reqStatus === "rejected" ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-600 border border-rose-500/20">
                            <AlertCircle className="size-3" />
                            Request Declined
                          </span>
                        ) : (
                          <Button
                            onClick={() => setSelectedFaculty(faculty)}
                            className="h-8 text-[11px] font-semibold bg-[#1a1917] hover:bg-[#333]"
                          >
                            Re-request Chat
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Request Chat Modal popup */}
            <AnimatePresence>
              {selectedFaculty && (
                <div className="fixed inset-0 bg-black/35 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="w-full max-w-md bg-white p-6 rounded-3xl border border-[#ebdcc9] shadow-lg text-left"
                  >
                    <h4 className="text-sm font-bold text-[#1a1917] mb-1">Send Private Chat Request</h4>
                    <p className="text-[11px] text-[#8e8a80] mb-4">
                      Requesting chat with: <b>{selectedFaculty.name}</b> ({selectedFaculty.department})
                    </p>

                    <form onSubmit={handleRequestSubmit} className="space-y-4">
                      <div>
                        <label className="text-[11px] font-bold text-[#6b6861] uppercase tracking-wider block mb-1">
                          Subject
                        </label>
                        <Input
                          type="text"
                          placeholder="e.g. Operating Systems Lab 2 Doubt"
                          value={requestSubject}
                          onChange={(e) => setRequestSubject(e.target.value)}
                          className="h-9 text-xs"
                          required
                        />
                      </div>
                      
                      <div>
                        <label className="text-[11px] font-bold text-[#6b6861] uppercase tracking-wider block mb-1">
                          Reason / Description
                        </label>
                        <Textarea
                          placeholder="Please provide details for the chat discussion request..."
                          value={requestReason}
                          onChange={(e) => setRequestReason(e.target.value)}
                          className="text-xs min-h-[90px]"
                          required
                        />
                      </div>

                      <div className="pt-2 border-t border-[#ebdcc9]/30 flex items-center justify-between">
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => setSelectedFaculty(null)}
                          className="h-9 px-4 text-xs font-semibold hover:bg-neutral-100"
                        >
                          Cancel
                        </Button>
                        <Button
                          type="submit"
                          disabled={isSubmittingRequest}
                          className="h-9 px-5 text-xs font-semibold bg-[#1a1917] hover:bg-[#333]"
                        >
                          {isSubmittingRequest ? "Sending..." : "Submit Request"}
                        </Button>
                      </div>
                    </form>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>

            {/* Section Formats Info Modal */}
            <AnimatePresence>
              {showSectionFormatsModal && (
                <div className="fixed inset-0 bg-black/35 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="w-full max-w-sm bg-white p-6 rounded-3xl border border-[#ebdcc9] shadow-lg text-left"
                  >
                    <h4 className="text-sm font-bold text-[#1a1917] mb-2 flex items-center gap-1.5">
                      <AlertCircle className="size-4.5 text-indigo-500" />
                      Accepted Section Formats
                    </h4>
                    <p className="text-xs text-[#6b6760] leading-[1.45] mb-4">
                      To access class chat channels, your section must exactly match the format of <span className="font-semibold">[DEPT_PREFIX]-[SECTION_LETTER]</span>:
                    </p>
                    
                    <div className="bg-[#FAF6EE] p-3 rounded-2xl border border-[#ebdcc9]/40 space-y-1.5 text-xs font-semibold text-[#1a1917] mb-4">
                      <div>💻 CSE Department: <span className="font-mono text-indigo-600">CSE-A</span>, <span className="font-mono text-indigo-600">CSE-B</span></div>
                      <div>📡 ECE Department: <span className="font-mono text-indigo-600">ECE-A</span>, <span className="font-mono text-indigo-600">ECE-B</span></div>
                      <div>⚙️ MECH Department: <span className="font-mono text-indigo-600">MEC-A</span>, <span className="font-mono text-indigo-600">MEC-B</span></div>
                      <div>🔌 EEE Department: <span className="font-mono text-indigo-600">EEE-A</span>, <span className="font-mono text-indigo-600">EEE-B</span></div>
                    </div>

                    <div className="flex justify-end">
                      <Button
                        onClick={() => setShowSectionFormatsModal(false)}
                        className="h-8 px-4 text-xs font-semibold bg-[#1a1917] hover:bg-[#333] rounded-lg animate-none shadow-none"
                      >
                        Understood
                      </Button>
                    </div>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
