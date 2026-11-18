import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import type { Socket } from "socket.io-client";
import { createAuthedSocket } from "../utils/socket-client";
import { apiFetch } from "../utils/api-client";
import { useProfile } from "../context/ProfileContext";
import { toast } from "sonner";
import {
  MessageSquare,
  MessageCircle,
  Send,
  Paperclip,
  Users,
  AlertCircle,
  FileText,
  Search,
  Clock,
  CheckCheck,
  UserCheck,
  UserPlus,
  Megaphone,
  ArrowLeft,
  ChevronDown,
  Pin,
  Trash2,
  Lock,
  X,
  Ban,
  Forward,
  GraduationCap,
  Mail,
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
    // Identity is derived server-side from the verified session.
    const socketInstance = createAuthedSocket();

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
        const res = await apiFetch(url, {
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
      const facRes = await apiFetch("/api/chat/faculty", {
        headers: { "x-user-id": profile.id, "x-user-role": "user" },
      });
      if (facRes.ok) {
        const facData = await facRes.json();
        setFacultyList(facData.data || []);
      }

      // 2. Fetch Requests
      const reqRes = await apiFetch("/api/chat/requests", {
        headers: { "x-user-id": profile.id, "x-user-role": "user" },
      });
      if (reqRes.ok) {
        const reqData = await reqRes.json();
        setRequests(reqData.data || []);
      }

      // 3. Fetch Contacts
      const conRes = await apiFetch("/api/chat/contacts", {
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
      const res = await apiFetch(`/api/chat/messages/${msgId}/react`, {
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
      const res = await apiFetch(`/api/chat/messages/${msgId}/pin`, {
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
      const res = await apiFetch(`/api/chat/messages/${msgId}/delete`, {
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
        await apiFetch("/api/chat/messages/read", {
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
      const res = await apiFetch("/api/profile", {
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
        const errData = await res.json().catch(() => ({}));
        toast.error(
          res.status === 401
            ? "Your session has expired. Please sign in again."
            : errData.message || `Failed to update profile (HTTP ${res.status}).`
        );
      }
    } catch (err) {
      toast.error("Could not reach the server. Check your connection and try again.");
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
      const res = await apiFetch("/api/chat/requests", {
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

  // ---------------------------------------------------------------------------
  // Presentational-only state & helpers (WhatsApp-style layout)
  // ---------------------------------------------------------------------------
  const [chatSearch, setChatSearch] = useState("");
  const [directoryQuery, setDirectoryQuery] = useState("");
  const [mobileShowChat, setMobileShowChat] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  // Close the bubble menu on outside click / Escape
  useEffect(() => {
    if (!openMenuId) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target?.closest("[data-msg-menu]")) setOpenMenuId(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenMenuId(null);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [openMenuId]);

  // Auto-grow composer
  useEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
  }, [messageText]);

  const openChat = (tab: "college" | "class" | "faculty" | "dm", contact?: any) => {
    if (contact) setActiveDmRecipient(contact);
    setActiveTab(tab);
    setOpenMenuId(null);
    setMobileShowChat(true);
  };

  const handleComposerKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      formRef.current?.requestSubmit();
    }
  };

  const isGroupChat = activeTab === "college" || activeTab === "class";
  const classBlocked = activeTab === "class" && (!profile?.section || !profile?.department);
  const canSend = !!messageText.trim() || !!fileAttachment;
  const pendingRequestCount = requests.filter((r) => r.status === "pending").length;
  const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
  const pinnedMessage = [...messages].reverse().find((m) => m.isPinned && !m.isDeleted) || null;

  const previewFor = (isActive: boolean, fallback: string) => {
    if (!isActive || !lastMessage) return { text: fallback, time: "" };
    const who = lastMessage.senderId === profile?.id ? "You" : (lastMessage.senderName || "").split(" ")[0];
    const body = lastMessage.isDeleted
      ? "This message was deleted"
      : lastMessage.content || (lastMessage.attachments?.length ? `📎 ${lastMessage.attachments[0]}` : "");
    return { text: who ? `${who}: ${body}` : body, time: formatListTime(lastMessage.createdAt) };
  };

  const q = chatSearch.trim().toLowerCase();
  const matches = (...fields: (string | undefined)[]) =>
    !q || fields.some((f) => (f || "").toLowerCase().includes(q));

  const classTitle = profile?.section ? `Class Group · ${profile.section}` : "Class Group";
  const chatRows: {
    key: string;
    tab: "college" | "class" | "dm";
    contact?: any;
    title: string;
    avatar: React.ReactNode;
    online?: boolean;
    fallback: string;
    active: boolean;
  }[] = [];
  if (matches("College Announcements", "college channel")) {
    chatRows.push({
      key: "college",
      tab: "college",
      title: "College Announcements",
      avatar: <Megaphone className="size-5" aria-hidden="true" />,
      fallback: "Official administrative notice board",
      active: activeTab === "college",
    });
  }
  if (matches(classTitle, "class group", profile?.department)) {
    chatRows.push({
      key: "class",
      tab: "class",
      title: classTitle,
      avatar: <Users className="size-5" aria-hidden="true" />,
      fallback: profile?.section ? profile?.department || "Your section" : "Complete your profile to join",
      active: activeTab === "class",
    });
  }
  contacts.forEach((contact) => {
    if (!matches(contact.name, contact.department)) return;
    chatRows.push({
      key: `dm-${contact.id}`,
      tab: "dm",
      contact,
      title: contact.name,
      avatar: initials(contact.name),
      online: onlineUsers.has(contact.id),
      fallback: contact.department || "Faculty",
      active: activeTab === "dm" && activeDmRecipient?.id === contact.id,
    });
  });

  // Build the timeline: date separators + grouped bubbles
  type TimelineItem =
    | { kind: "date"; key: string; label: string }
    | { kind: "msg"; key: string; msg: any; firstOfGroup: boolean; lastOfGroup: boolean };
  const timeline: TimelineItem[] = [];
  messages.forEach((msg, i) => {
    const d = safeDate(msg.createdAt);
    const prev = i > 0 ? messages[i - 1] : null;
    const next = i < messages.length - 1 ? messages[i + 1] : null;
    const prevD = prev ? safeDate(prev.createdAt) : null;
    const nextD = next ? safeDate(next.createdAt) : null;
    if (!prevD || !sameDay(prevD, d)) {
      timeline.push({ kind: "date", key: `date-${dayKey(d)}-${i}`, label: dayLabel(d) });
    }
    const groupedWithPrev =
      !!prev && !!prevD && prev.senderId === msg.senderId && sameDay(prevD, d) && d.getTime() - prevD.getTime() < GROUP_GAP_MS;
    const groupedWithNext =
      !!next && !!nextD && next.senderId === msg.senderId && sameDay(nextD, d) && nextD.getTime() - d.getTime() < GROUP_GAP_MS;
    timeline.push({ kind: "msg", key: msg.id ?? `m-${i}`, msg, firstOfGroup: !groupedWithPrev, lastOfGroup: !groupedWithNext });
  });

  const headerInfo = (() => {
    if (activeTab === "college") {
      return { title: "College Announcements", icon: <Megaphone className="size-5" aria-hidden="true" />, sub: "Official administrative notice board" };
    }
    if (activeTab === "class") {
      return {
        title: classTitle,
        icon: <Users className="size-5" aria-hidden="true" />,
        sub: profile?.department ? `${profile.department}${profile?.semester ? ` · ${profile.semester}` : ""}` : "Class group chat",
      };
    }
    if (activeTab === "dm" && activeDmRecipient) {
      return {
        title: activeDmRecipient.name,
        icon: initials(activeDmRecipient.name),
        sub: onlineUsers.has(activeDmRecipient.id) ? "online" : activeDmRecipient.department || "offline",
      };
    }
    return null;
  })();

  const filteredFaculty = facultyList.filter((f) => {
    const dq = directoryQuery.trim().toLowerCase();
    return !dq || [f.name, f.department, f.email].some((x: string | undefined) => (x || "").toLowerCase().includes(dq));
  });

  const focusRing =
    "outline-none focus-visible:ring-2 focus-visible:ring-[#1a1917]/40 focus-visible:ring-offset-1";

  // Shared profile-details form fields (used by overlay & class blocker)
  const profileFields = (submitLabel: string, busyLabel: string, includeName: boolean) => (
    <form onSubmit={handleUpdateProfile} className="mt-4 space-y-3.5 text-left">
      {includeName && (
        <div>
          <label htmlFor="msg-profile-name" className="text-[11px] font-bold text-[#676767] uppercase tracking-wider block mb-1">
            Full Name
          </label>
          <Input
            id="msg-profile-name"
            type="text"
            placeholder="Enter your full name"
            value={profileName}
            onChange={(e) => setProfileName(e.target.value)}
            className="h-10 text-base md:text-xs"
            required
          />
        </div>
      )}
      <div>
        <label className="text-[11px] font-bold text-[#676767] uppercase tracking-wider block mb-1">Department</label>
        <select
          value={profileDepartment}
          onChange={(e) => {
            setProfileDepartment(e.target.value);
            setProfileSection("");
          }}
          className="w-full h-10 rounded-lg border border-[#dedede] bg-[#f4f4f4] text-base md:text-xs px-2.5 outline-none focus:border-[#1a1917]"
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
        <label className="text-[11px] font-bold text-[#676767] uppercase tracking-wider block mb-1">Program / Degree</label>
        <select
          value={profileDegree}
          onChange={(e) => {
            setProfileDegree(e.target.value);
            setProfileSemester("");
          }}
          className="w-full h-10 rounded-lg border border-[#dedede] bg-[#f4f4f4] text-base md:text-xs px-2.5 outline-none focus:border-[#1a1917]"
          required
        >
          <option value="B.Tech">B.Tech (8 Semesters)</option>
          <option value="M.Tech">M.Tech (6 Semesters)</option>
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[11px] font-bold text-[#676767] uppercase tracking-wider block mb-1">Semester</label>
          <select
            value={profileSemester}
            onChange={(e) => setProfileSemester(e.target.value)}
            className="w-full h-10 rounded-lg border border-[#dedede] bg-[#f4f4f4] text-base md:text-xs px-2.5 outline-none focus:border-[#1a1917]"
            required
          >
            <option value="">Select</option>
            {(profileDegree === "B.Tech" ? [1, 2, 3, 4, 5, 6, 7, 8] : [1, 2, 3, 4, 5, 6]).map((s) => (
              <option key={s} value={`Semester ${s}`}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[11px] font-bold text-[#676767] uppercase tracking-wider block mb-1">Section</label>
          <Input
            type="text"
            placeholder={`${getDeptPrefix(profileDepartment)}-A`}
            value={profileSection}
            onChange={(e) => setProfileSection(e.target.value)}
            className="h-10 text-base md:text-xs"
            required
          />
          <button
            type="button"
            onClick={() => setShowSectionFormatsModal(true)}
            className={`text-[11px] text-[#1a1917] underline-offset-2 hover:underline mt-1 font-semibold block text-left rounded ${focusRing}`}
          >
            Section formats accepted
          </button>
        </div>
      </div>
      <Button type="submit" disabled={isUpdatingProfile} className="w-full h-10 text-xs font-semibold bg-[#1a1917] hover:bg-[#333] mt-2">
        {isUpdatingProfile ? busyLabel : submitLabel}
      </Button>
    </form>
  );

  const backButton = (
    <button
      type="button"
      onClick={() => setMobileShowChat(false)}
      aria-label="Back to chats"
      className={`md:hidden -ml-2 size-11 shrink-0 rounded-full flex items-center justify-center text-[#1a1917] hover:bg-[#f4f4f4] ${focusRing}`}
    >
      <ArrowLeft className="size-5" aria-hidden="true" />
    </button>
  );

  return (
    <div className="relative flex w-full h-[calc(100dvh-112px)] md:h-[calc(100dvh-128px)] min-h-[460px] overflow-hidden rounded-2xl border border-[#dedede] bg-white shadow-[0_4px_20px_rgba(128,128,128,0.06)]">
      {isProfileIncomplete && (
        <div className="absolute inset-0 bg-neutral-900/60 backdrop-blur-md z-45 flex items-center justify-center p-4 overflow-y-auto">
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md bg-white p-6 rounded-3xl border border-[#dedede] shadow-xl text-left"
          >
            <h4 className="text-base font-bold text-[#1a1917] flex items-center gap-2">
              <GraduationCap className="size-5 text-[#676767]" aria-hidden="true" />
              Complete Your Student Profile
            </h4>
            <p className="text-xs text-[#676767] mt-1">
              Please complete your academic profile details using the correct formats before proceeding to Student Communications.
            </p>
            {profileFields("Verify & Enter Portal", "Saving Profile...", true)}
          </motion.div>
        </div>
      )}

      {/* ============================ LEFT PANE ============================ */}
      <aside
        aria-label="Chats"
        className={`${mobileShowChat ? "hidden" : "flex"} md:flex w-full md:w-[340px] md:shrink-0 flex-col border-r border-[#ebebeb] bg-white min-h-0`}
      >
        {/* Pane header */}
        <div className="h-16 shrink-0 px-4 flex items-center justify-between bg-[#fafafa] border-b border-[#ebebeb]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="size-10 rounded-full bg-[#1a1917] text-white flex items-center justify-center text-sm font-bold uppercase shrink-0" aria-hidden="true">
              {(profile?.name || "S").charAt(0)}
            </div>
            <div className="min-w-0">
              <h3 className="text-[15px] font-bold text-[#1a1917] leading-tight">Chats</h3>
              <p className="text-[11px] text-[#8a8a8a] truncate">{profile?.name || "Student"}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => openChat("faculty")}
            aria-label="Open faculty directory to request a new chat"
            title="New chat with faculty"
            className={`relative size-11 rounded-full flex items-center justify-center text-[#676767] hover:bg-[#ebebeb] hover:text-[#1a1917] transition-colors ${focusRing} ${
              activeTab === "faculty" ? "bg-[#ebebeb] text-[#1a1917]" : ""
            }`}
          >
            <UserPlus className="size-5" aria-hidden="true" />
            {pendingRequestCount > 0 && (
              <span className="absolute top-1.5 right-1.5 min-w-4 h-4 px-1 rounded-full bg-[#1a1917] text-white text-[9px] font-bold flex items-center justify-center">
                {pendingRequestCount}
              </span>
            )}
          </button>
        </div>

        {/* Search */}
        <div className="px-3 py-2 shrink-0 border-b border-[#ebebeb]">
          <label className="relative block">
            <span className="sr-only">Search chats</span>
            <Search className="size-4 text-[#8a8a8a] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
            <input
              type="search"
              value={chatSearch}
              onChange={(e) => setChatSearch(e.target.value)}
              placeholder="Search or start a new chat"
              className="w-full h-10 rounded-lg bg-[#f4f4f4] pl-9 pr-3 text-base md:text-[13px] text-[#1a1917] placeholder:text-[#8a8a8a] outline-none focus:bg-white focus:ring-2 focus:ring-[#1a1917]/15 transition"
            />
          </label>
        </div>

        {/* Chat list */}
        <nav className="flex-1 overflow-y-auto min-h-0" aria-label="Conversations">
          <ul role="list">
            {chatRows.map((row) => {
              const preview = previewFor(row.active, row.fallback);
              return (
                <li key={row.key}>
                  <button
                    type="button"
                    onClick={() => openChat(row.tab, row.contact)}
                    aria-current={row.active ? "true" : undefined}
                    className={`w-full flex items-center gap-3 px-3 min-h-[72px] text-left transition-colors ${focusRing} focus-visible:ring-inset ${
                      row.active ? "bg-[#f0f0f0]" : "hover:bg-[#fafafa]"
                    }`}
                  >
                    <div className="relative shrink-0">
                      <div
                        className={`size-12 rounded-full flex items-center justify-center text-sm font-bold uppercase ${
                          row.tab === "dm" ? "bg-[#dedede] text-[#1a1917]" : "bg-[#1a1917] text-white"
                        }`}
                        aria-hidden="true"
                      >
                        {row.avatar}
                      </div>
                      {row.tab === "dm" && (
                        <span
                          className={`absolute bottom-0.5 right-0.5 size-3 rounded-full border-2 border-white ${row.online ? "bg-emerald-500" : "bg-[#c4c4c4]"}`}
                          aria-hidden="true"
                        />
                      )}
                    </div>
                    <div className="flex-1 min-w-0 border-b border-[#f0f0f0] py-3 self-stretch flex flex-col justify-center">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-[14.5px] font-semibold text-[#111111] truncate">{row.title}</span>
                        {preview.time && <span className="text-[11px] text-[#8a8a8a] shrink-0">{preview.time}</span>}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {row.active && partnerTyping ? (
                          <span className="text-[12.5px] text-emerald-700 font-medium truncate">typing…</span>
                        ) : (
                          <span className="text-[12.5px] text-[#676767] truncate">
                            {row.tab === "college" && <Lock className="inline size-3 mr-1 -mt-0.5 text-[#8a8a8a]" aria-hidden="true" />}
                            {preview.text}
                          </span>
                        )}
                        {row.tab === "dm" && <span className="sr-only">{row.online ? "(online)" : "(offline)"}</span>}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}

            {/* Faculty directory row */}
            {matches("Faculty Directory", "request chat", "new chat") && (
              <li>
                <button
                  type="button"
                  onClick={() => openChat("faculty")}
                  aria-current={activeTab === "faculty" ? "true" : undefined}
                  className={`w-full flex items-center gap-3 px-3 min-h-[72px] text-left transition-colors ${focusRing} focus-visible:ring-inset ${
                    activeTab === "faculty" ? "bg-[#f0f0f0]" : "hover:bg-[#fafafa]"
                  }`}
                >
                  <div className="size-12 rounded-full bg-[#f4f4f4] border border-dashed border-[#c4c4c4] flex items-center justify-center text-[#676767] shrink-0" aria-hidden="true">
                    <GraduationCap className="size-5" />
                  </div>
                  <div className="flex-1 min-w-0 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[14.5px] font-semibold text-[#111111]">Faculty Directory</span>
                      {pendingRequestCount > 0 && (
                        <span className="text-[10px] font-bold text-[#676767] bg-[#f4f4f4] border border-[#dedede] rounded-full px-2 py-0.5 shrink-0">
                          {pendingRequestCount} pending
                        </span>
                      )}
                    </div>
                    <span className="text-[12.5px] text-[#676767] block truncate">Request a private chat with faculty</span>
                  </div>
                </button>
              </li>
            )}
          </ul>

          {contacts.length === 0 && !q && (
            <div className="mx-3 my-4 rounded-xl border border-dashed border-[#dedede] bg-[#fafafa] p-4 text-center">
              <MessageCircle className="size-5 text-[#8a8a8a] mx-auto" aria-hidden="true" />
              <p className="text-[12px] text-[#676767] mt-1.5">No direct chats yet. Request approval from a faculty member to start one.</p>
            </div>
          )}
          {chatRows.length === 0 && q && (
            <p className="text-center text-[12.5px] text-[#8a8a8a] px-4 py-8">No chats match “{chatSearch}”.</p>
          )}
        </nav>
      </aside>

      {/* ========================= CONVERSATION PANE ========================= */}
      <section
        aria-label={activeTab === "faculty" ? "Faculty directory" : headerInfo?.title || "Conversation"}
        className={`${mobileShowChat ? "flex" : "hidden"} md:flex flex-1 min-w-0 flex-col min-h-0 bg-[#f4f4f2]`}
      >
        {activeTab === "faculty" ? (
          // ------------------------- Faculty Directory -------------------------
          <>
            <header className="h-16 shrink-0 px-4 flex items-center gap-3 bg-[#fafafa] border-b border-[#ebebeb]">
              {backButton}
              <div className="size-10 rounded-full bg-[#1a1917] text-white flex items-center justify-center shrink-0" aria-hidden="true">
                <GraduationCap className="size-5" />
              </div>
              <div className="min-w-0">
                <h2 className="text-[15px] font-semibold text-[#111111] truncate">Faculty Directory</h2>
                <p className="text-[12px] text-[#8a8a8a] truncate">
                  {facultyList.length} faculty{pendingRequestCount > 0 ? ` · ${pendingRequestCount} pending request${pendingRequestCount > 1 ? "s" : ""}` : ""}
                </p>
              </div>
            </header>
            <div className="flex-1 overflow-y-auto min-h-0 p-4 md:p-6 bg-[#fafafa]">
              <div className="max-w-3xl mx-auto">
                <p className="text-[12.5px] text-[#676767] leading-relaxed mb-4">
                  Direct private chats are restricted. Find a faculty member below and choose <b className="text-[#1a1917]">Request Chat</b>. Once they accept, the chat appears in your chat list.
                </p>
                <label className="relative block mb-5">
                  <span className="sr-only">Search faculty</span>
                  <Search className="size-4 text-[#8a8a8a] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
                  <input
                    type="search"
                    value={directoryQuery}
                    onChange={(e) => setDirectoryQuery(e.target.value)}
                    placeholder="Search by name, department or email"
                    className="w-full h-10 rounded-lg bg-white border border-[#dedede] pl-9 pr-3 text-base md:text-[13px] text-[#1a1917] placeholder:text-[#8a8a8a] outline-none focus:border-[#1a1917]"
                  />
                </label>

                {filteredFaculty.length === 0 ? (
                  <div className="text-center py-12 text-[12.5px] text-[#8a8a8a]">
                    <Users className="size-6 mx-auto mb-2 text-[#c4c4c4]" aria-hidden="true" />
                    No faculty members found.
                  </div>
                ) : (
                  <ul role="list" className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    {filteredFaculty.map((faculty) => {
                      const reqStatus = getRequestStatus(faculty.id);
                      return (
                        <li key={faculty.id} className="bg-white p-4 rounded-2xl border border-[#ebebeb] flex flex-col justify-between gap-4">
                          <div className="flex items-start gap-3">
                            <div className="size-11 rounded-full bg-[#f4f4f4] border border-[#ebebeb] flex items-center justify-center font-bold text-xs uppercase text-[#1a1917] shrink-0" aria-hidden="true">
                              {initials(faculty.name)}
                            </div>
                            <div className="min-w-0">
                              <div className="text-[13.5px] font-semibold text-[#111111] truncate">{faculty.name}</div>
                              <div className="text-[12px] text-[#8a8a8a] truncate">{faculty.department || "General Academy"}</div>
                              <div className="mt-1 text-[11.5px] text-[#676767] flex items-center gap-1 min-w-0">
                                <Mail className="size-3 shrink-0" aria-hidden="true" />
                                <span className="truncate">{faculty.email}</span>
                              </div>
                            </div>
                          </div>
                          <div className="pt-3 border-t border-[#f0f0f0] flex items-center justify-between">
                            {reqStatus === null ? (
                              <Button onClick={() => setSelectedFaculty(faculty)} className="h-10 text-[12px] font-semibold bg-[#1a1917] hover:bg-[#333]">
                                <UserPlus className="size-3.5 mr-1" aria-hidden="true" />
                                Request Chat
                              </Button>
                            ) : reqStatus === "pending" ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-700 border border-amber-500/20">
                                <Clock className="size-3" aria-hidden="true" />
                                Pending approval
                              </span>
                            ) : reqStatus === "approved" ? (
                              <button
                                type="button"
                                onClick={() => {
                                  const c = contacts.find((x) => x.id === faculty.id);
                                  if (c) openChat("dm", c);
                                }}
                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-700 border border-emerald-500/20 ${focusRing}`}
                                aria-label={`Approved. Open chat with ${faculty.name}`}
                              >
                                <UserCheck className="size-3" aria-hidden="true" />
                                Approved (Available in DMs)
                              </button>
                            ) : reqStatus === "rejected" ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-rose-500/10 text-rose-700 border border-rose-500/20">
                                <AlertCircle className="size-3" aria-hidden="true" />
                                Request Declined
                              </span>
                            ) : (
                              <Button onClick={() => setSelectedFaculty(faculty)} className="h-10 text-[12px] font-semibold bg-[#1a1917] hover:bg-[#333]">
                                Re-request Chat
                              </Button>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </>
        ) : !headerInfo ? (
          // ------------------------- No chat selected -------------------------
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-[#fafafa]">
            {backButton}
            <div className="relative mb-6" aria-hidden="true">
              <div className="size-28 rounded-full bg-white border border-[#ebebeb] flex items-center justify-center shadow-sm">
                <MessageSquare className="size-11 text-[#c4c4c4]" />
              </div>
              <div className="absolute -right-3 top-3 size-10 rounded-2xl rounded-bl-sm bg-[#e3efe3] border border-white flex items-center justify-center shadow-sm">
                <Send className="size-4 text-[#4f6b4f]" />
              </div>
            </div>
            <h2 className="text-xl font-light text-[#1a1917]">Integrity Messages</h2>
            <p className="text-[13px] text-[#8a8a8a] mt-2 max-w-sm">
              Select a chat from the list to start messaging, or open the Faculty Directory to request a private chat.
            </p>
            <p className="text-[11px] text-[#8a8a8a] mt-8 flex items-center gap-1">
              <Lock className="size-3" aria-hidden="true" /> Conversations are limited to your institution
            </p>
          </div>
        ) : (
          // ------------------------- Conversation -------------------------
          <>
            <header className="h-16 shrink-0 px-4 flex items-center gap-3 bg-[#fafafa] border-b border-[#ebebeb]">
              {backButton}
              <div className="relative shrink-0">
                <div
                  className={`size-10 rounded-full flex items-center justify-center text-sm font-bold uppercase ${
                    activeTab === "dm" ? "bg-[#dedede] text-[#1a1917]" : "bg-[#1a1917] text-white"
                  }`}
                  aria-hidden="true"
                >
                  {headerInfo.icon}
                </div>
                {activeTab === "dm" && activeDmRecipient && onlineUsers.has(activeDmRecipient.id) && (
                  <span className="absolute bottom-0 right-0 size-3 rounded-full border-2 border-[#fafafa] bg-emerald-500" aria-hidden="true" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-[15px] font-semibold text-[#111111] truncate">{headerInfo.title}</h2>
                <p className="text-[12px] truncate" aria-live="polite">
                  {partnerTyping ? (
                    <span className="text-emerald-700 font-medium">{isGroupChat ? `${partnerTyping} is typing…` : "typing…"}</span>
                  ) : (
                    <span className="text-[#8a8a8a]">{headerInfo.sub}</span>
                  )}
                </p>
              </div>
            </header>

            {classBlocked ? (
              <div className="flex-1 overflow-y-auto min-h-0 flex flex-col items-center justify-center p-6 text-center">
                <div className="size-16 rounded-full bg-amber-500/10 text-amber-700 flex items-center justify-center mb-4" aria-hidden="true">
                  <AlertCircle className="size-7" />
                </div>
                <h3 className="text-base font-bold text-[#1a1917]">Complete Your Profile</h3>
                <p className="text-xs text-[#676767] mt-1 max-w-sm">
                  You must set your Department, Year/Semester, and Section in order to access class-level group chat channels.
                </p>
                <div className="mt-4 w-full max-w-sm bg-white p-5 rounded-2xl border border-[#ebebeb] shadow-sm">
                  {profileFields("Save & Access Chats", "Updating...", false)}
                </div>
              </div>
            ) : (
              <>
                {/* Pinned banner */}
                {pinnedMessage && (
                  <button
                    type="button"
                    onClick={() => document.getElementById(`msg-${pinnedMessage.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}
                    className={`shrink-0 flex items-center gap-2.5 px-4 min-h-11 bg-white/95 border-b border-[#ebebeb] text-left ${focusRing} focus-visible:ring-inset`}
                    aria-label="Jump to pinned message"
                  >
                    <Pin className="size-4 text-[#676767] shrink-0" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[11px] font-semibold text-[#1a1917]">Pinned message</span>
                      <span className="block text-[12px] text-[#676767] truncate">{pinnedMessage.content || pinnedMessage.attachments?.[0]}</span>
                    </span>
                  </button>
                )}

                {/* Message list */}
                <div
                  role="log"
                  aria-live="polite"
                  aria-label={`Messages in ${headerInfo.title}`}
                  className="flex-1 overflow-y-auto min-h-0 px-3 md:px-[6%] py-3"
                  style={{
                    backgroundColor: "#f4f4f2",
                    backgroundImage:
                      "radial-gradient(rgba(26,25,23,0.055) 1px, transparent 1.2px), radial-gradient(rgba(26,25,23,0.035) 1px, transparent 1.2px)",
                    backgroundSize: "22px 22px, 22px 22px",
                    backgroundPosition: "0 0, 11px 11px",
                  }}
                >
                  {messages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center p-6">
                      <div className="relative mb-5" aria-hidden="true">
                        <div className="size-24 rounded-full bg-white/90 border border-[#ebebeb] shadow-sm flex items-center justify-center">
                          {activeTab === "college" ? (
                            <Megaphone className="size-9 text-[#b5b5b5]" />
                          ) : (
                            <MessageCircle className="size-9 text-[#b5b5b5]" />
                          )}
                        </div>
                        <div className="absolute -left-5 top-2 px-2.5 py-1.5 rounded-xl rounded-br-sm bg-white border border-[#ebebeb] shadow-sm text-[11px]">👋</div>
                        <div className="absolute -right-4 bottom-1 w-9 h-6 rounded-xl rounded-bl-sm bg-[#e3efe3] border border-white shadow-sm flex items-center justify-center gap-0.5">
                          <span className="size-1 rounded-full bg-[#7a907a]" />
                          <span className="size-1 rounded-full bg-[#7a907a]" />
                          <span className="size-1 rounded-full bg-[#7a907a]" />
                        </div>
                      </div>
                      <div className="rounded-xl bg-white/90 border border-[#ebebeb] px-4 py-3 shadow-sm max-w-xs">
                        <p className="text-[13.5px] font-semibold text-[#1a1917]">
                          {activeTab === "college" ? "No announcements yet" : "No messages yet"}
                        </p>
                        <p className="text-[12px] text-[#676767] mt-0.5">
                          {activeTab === "college"
                            ? "Official notices from administrators and faculty will show up here."
                            : activeTab === "class"
                            ? "Be the first to say hello to your classmates."
                            : `Say hi to ${activeDmRecipient?.name?.split(" ")[0] || "start the conversation"}.`}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <ul role="list" className="flex flex-col">
                      {timeline.map((item, idx) => {
                        if (item.kind === "date") {
                          return (
                            <li key={item.key} className="flex justify-center my-3 first:mt-1 sticky top-1 z-[5]">
                              <span className="px-3 py-1 rounded-lg bg-white/95 text-[11.5px] font-medium text-[#676767] shadow-[0_1px_1px_rgba(0,0,0,0.06)] uppercase tracking-wide">
                                {item.label}
                              </span>
                            </li>
                          );
                        }
                        const { msg, firstOfGroup, lastOfGroup } = item;
                        const isMe = msg.senderId === profile?.id;
                        const isDeleted = !!msg.isDeleted;
                        const isPinned = !!msg.isPinned;
                        const readByArray = msg.readBy || [];
                        const reactionGroups = groupReactions(msg.reactions || []);
                        const showSender = isGroupChat && !isMe && firstOfGroup;
                        const isFacultySender = msg.senderRole === "faculty" || msg.senderRole === "admin";
                        const menuOpen = openMenuId === msg.id;
                        const openUp = idx >= timeline.length - 3 && timeline.length > 5;
                        const timeStr = safeDate(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

                        return (
                          <motion.li
                            key={item.key}
                            id={`msg-${msg.id}`}
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.16 }}
                            className={`flex items-end gap-2 ${isMe ? "justify-end" : "justify-start"} ${firstOfGroup ? "mt-2" : "mt-0.5"} ${
                              reactionGroups.length > 0 ? "mb-3.5" : ""
                            }`}
                          >
                            {!isMe && isGroupChat && (
                              <div className="w-8 shrink-0 self-start" aria-hidden="true">
                                {firstOfGroup && (
                                  <div className="size-8 rounded-full bg-[#dedede] flex items-center justify-center text-[10px] font-bold uppercase text-[#1a1917]">
                                    {initials(msg.senderName)}
                                  </div>
                                )}
                              </div>
                            )}

                            <div className={`group relative max-w-[85%] md:max-w-[65%] ${menuOpen ? "z-20" : ""}`} data-msg-menu>
                              <div
                                className={`relative rounded-lg px-2.5 pt-1.5 pb-1.5 text-[14px] leading-[1.4] shadow-[0_1px_0.5px_rgba(11,20,26,0.13)] ${
                                  isMe ? "bg-[#e3efe3] text-[#111111]" : "bg-white text-[#111111]"
                                } ${firstOfGroup ? (isMe ? "rounded-tr-none" : "rounded-tl-none") : ""} ${isPinned ? "ring-1 ring-amber-400/60" : ""}`}
                              >
                                {/* Tail */}
                                {firstOfGroup && (
                                  <span
                                    aria-hidden="true"
                                    className={`absolute top-0 w-2 h-3 ${isMe ? "-right-2 bg-[#e3efe3]" : "-left-2 bg-white"}`}
                                    style={{ clipPath: isMe ? "polygon(0 0, 100% 0, 0 100%)" : "polygon(0 0, 100% 0, 100% 100%)" }}
                                  />
                                )}

                                {showSender && (
                                  <div className="flex items-center gap-1.5 mb-0.5 pr-6">
                                    <span className="text-[12.5px] font-semibold truncate" style={{ color: nameColor(msg.senderName || "") }}>
                                      {msg.senderName}
                                    </span>
                                    <span
                                      className={`px-1.5 rounded text-[9px] font-bold uppercase tracking-wide ${
                                        isFacultySender ? "bg-[#1a1917] text-white" : "bg-[#f0f0f0] text-[#676767]"
                                      }`}
                                    >
                                      {isFacultySender ? "Faculty" : "Student"}
                                    </span>
                                  </div>
                                )}

                                {msg.forwardedFrom && (
                                  <div className="flex items-center gap-1 text-[11.5px] italic text-[#8a8a8a] mb-0.5">
                                    <Forward className="size-3" aria-hidden="true" />
                                    Forwarded from {msg.forwardedFrom}
                                  </div>
                                )}

                                {msg.attachments && msg.attachments.length > 0 && (
                                  <div className="flex flex-col gap-1 mb-1 mt-0.5">
                                    {msg.attachments.map((file: string, aIdx: number) => (
                                      <div
                                        key={aIdx}
                                        className={`flex items-center gap-2.5 rounded-md px-2.5 py-2 min-w-[200px] ${isMe ? "bg-[#d3e3d3]" : "bg-[#f4f4f4]"}`}
                                      >
                                        <div className="size-8 rounded bg-white/80 flex items-center justify-center shrink-0" aria-hidden="true">
                                          <FileText className="size-4 text-[#676767]" />
                                        </div>
                                        <span className="text-[12.5px] font-medium text-[#1a1917] truncate">{file}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}

                                <div className={`whitespace-pre-wrap break-words ${isDeleted ? "italic text-[#8a8a8a]" : ""}`}>
                                  {isDeleted && <Ban className="inline size-3.5 mr-1 -mt-0.5" aria-hidden="true" />}
                                  {msg.content}
                                  {/* spacer so the meta never overlaps text */}
                                  <span className="inline-block w-[72px]" aria-hidden="true" />
                                </div>

                                {/* Meta: pin + time + ticks */}
                                <span className="absolute right-2 bottom-1 flex items-center gap-1 text-[10.5px] text-[#8a8a8a] select-none">
                                  {isPinned && <Pin className="size-3 text-amber-600" aria-label="Pinned" />}
                                  <time dateTime={safeDate(msg.createdAt).toISOString()}>{timeStr}</time>
                                  {isMe && activeTab === "dm" && (
                                    readByArray.length > 1 ? (
                                      <CheckCheck className="size-3.5 text-[#2f7de1]" aria-label="Read" />
                                    ) : (
                                      <CheckCheck className="size-3.5 text-[#a3a3a3]" aria-label="Delivered" />
                                    )
                                  )}
                                </span>

                                {/* Hover menu trigger */}
                                {!isDeleted && (
                                  <button
                                    type="button"
                                    onClick={() => setOpenMenuId(menuOpen ? null : msg.id)}
                                    aria-label="Message options"
                                    aria-haspopup="menu"
                                    aria-expanded={menuOpen}
                                    className={`absolute top-0.5 right-0.5 size-7 rounded-full flex items-center justify-center text-[#676767] transition-opacity ${
                                      isMe ? "bg-[#e3efe3]" : "bg-white"
                                    } ${menuOpen ? "opacity-100" : "opacity-100 md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100"} ${focusRing}`}
                                  >
                                    <ChevronDown className="size-4" aria-hidden="true" />
                                  </button>
                                )}
                              </div>

                              {/* Reactions */}
                              {reactionGroups.length > 0 && (
                                <div className={`absolute -bottom-3.5 flex gap-1 ${isMe ? "right-2" : "left-2"}`}>
                                  {reactionGroups.map((g) => (
                                    <button
                                      key={g.emoji}
                                      type="button"
                                      onClick={() => handleReactToMessage(msg.id, g.emoji)}
                                      title={`Reacted by ${g.names.join(", ")}`}
                                      aria-label={`${g.emoji} ${g.count}, reacted by ${g.names.join(", ")}. Toggle your reaction`}
                                      className={`h-6 px-1.5 rounded-full bg-white border border-[#ebebeb] shadow-sm text-[12px] flex items-center gap-0.5 hover:bg-[#fafafa] ${focusRing}`}
                                    >
                                      <span>{g.emoji}</span>
                                      {g.count > 1 && <span className="text-[10px] text-[#676767] font-semibold">{g.count}</span>}
                                    </button>
                                  ))}
                                </div>
                              )}

                              {/* Options menu */}
                              <AnimatePresence>
                                {menuOpen && !isDeleted && (
                                  <motion.div
                                    role="menu"
                                    aria-label="Message actions"
                                    initial={{ opacity: 0, scale: 0.96, y: openUp ? 4 : -4 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.96 }}
                                    transition={{ duration: 0.12 }}
                                    className={`absolute z-30 w-56 rounded-xl bg-white border border-[#ebebeb] shadow-lg py-1.5 ${
                                      openUp ? "bottom-full mb-1" : "top-full mt-1"
                                    } ${isMe ? "right-0 origin-top-right" : "left-0 origin-top-left"}`}
                                  >
                                    <div className="flex items-center justify-between px-2 pb-1.5 mb-1 border-b border-[#f0f0f0]">
                                      {["👍", "❤️", "😂", "🔥", "🎉"].map((emoji) => (
                                        <button
                                          key={emoji}
                                          type="button"
                                          role="menuitem"
                                          onClick={() => {
                                            handleReactToMessage(msg.id, emoji);
                                            setOpenMenuId(null);
                                          }}
                                          aria-label={`React with ${emoji}`}
                                          className={`size-9 rounded-full text-lg flex items-center justify-center hover:bg-[#f4f4f4] hover:scale-110 transition-transform ${focusRing}`}
                                        >
                                          {emoji}
                                        </button>
                                      ))}
                                    </div>
                                    <button
                                      type="button"
                                      role="menuitem"
                                      onClick={() => {
                                        handleTogglePin(msg.id);
                                        setOpenMenuId(null);
                                      }}
                                      className={`w-full flex items-center gap-2.5 px-3 h-10 text-[13px] text-[#1a1917] hover:bg-[#f4f4f4] ${focusRing}`}
                                    >
                                      <Pin className="size-4 text-[#676767]" aria-hidden="true" />
                                      {isPinned ? "Unpin message" : "Pin message"}
                                    </button>
                                    {isMe && (
                                      <button
                                        type="button"
                                        role="menuitem"
                                        onClick={() => {
                                          handleDeleteMessage(msg.id, "everyone");
                                          setOpenMenuId(null);
                                        }}
                                        className={`w-full flex items-center gap-2.5 px-3 h-10 text-[13px] text-rose-600 hover:bg-rose-50 ${focusRing}`}
                                      >
                                        <Trash2 className="size-4" aria-hidden="true" />
                                        Delete for everyone
                                      </button>
                                    )}
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                            {!lastOfGroup && <span className="sr-only">,</span>}
                          </motion.li>
                        );
                      })}
                    </ul>
                  )}

                  {/* Typing indicator */}
                  <AnimatePresence>
                    {partnerTyping && (
                      <motion.div
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className={`flex items-end gap-2 mt-2 ${isGroupChat ? "pl-10" : ""}`}
                      >
                        <div className="rounded-lg rounded-tl-none bg-white px-3 py-2 shadow-[0_1px_0.5px_rgba(11,20,26,0.13)] flex items-center gap-2">
                          {isGroupChat && <span className="text-[11.5px] text-[#676767]">{partnerTyping}</span>}
                          <span className="flex items-center gap-1" aria-label={`${partnerTyping} is typing`}>
                            {[0, 1, 2].map((d) => (
                              <motion.span
                                key={d}
                                className="size-1.5 rounded-full bg-[#9a9a9a]"
                                animate={{ opacity: [0.3, 1, 0.3], y: [0, -2, 0] }}
                                transition={{ duration: 1, repeat: Infinity, delay: d * 0.15 }}
                              />
                            ))}
                          </span>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div ref={chatEndRef} />
                </div>

                {/* Composer */}
                {activeTab === "college" ? (
                  <div className="shrink-0 px-4 py-3 bg-[#fafafa] border-t border-[#ebebeb] flex items-center justify-center gap-2 text-[12px] text-[#676767] select-none">
                    <Lock className="size-3.5 shrink-0" aria-hidden="true" />
                    Only Administrators and Faculty members can post announcements to this channel.
                  </div>
                ) : (
                  <form ref={formRef} onSubmit={handleSendMessage} className="shrink-0 bg-[#fafafa] border-t border-[#ebebeb] px-2 md:px-4 py-2">
                    {fileAttachment && (
                      <div className="mb-2 flex items-center justify-between gap-2 px-3 py-2 bg-white border border-[#ebebeb] rounded-xl">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="size-8 rounded bg-[#f4f4f4] flex items-center justify-center shrink-0" aria-hidden="true">
                            <FileText className="size-4 text-[#676767]" />
                          </div>
                          <span className="text-[13px] font-medium text-[#1a1917] truncate">{fileAttachment}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setFileAttachment(null)}
                          aria-label="Remove attachment"
                          className={`size-9 rounded-full flex items-center justify-center text-[#676767] hover:bg-[#f4f4f4] hover:text-rose-600 shrink-0 ${focusRing}`}
                        >
                          <X className="size-4" aria-hidden="true" />
                        </button>
                      </div>
                    )}
                    <div className="flex items-end gap-1.5">
                      <button
                        type="button"
                        onClick={triggerMockUpload}
                        aria-label="Attach document"
                        title="Attach document"
                        className={`size-11 shrink-0 rounded-full flex items-center justify-center text-[#676767] hover:text-[#1a1917] hover:bg-[#ebebeb] transition-colors ${focusRing}`}
                      >
                        <Paperclip className="size-5" aria-hidden="true" />
                      </button>
                      <label className="flex-1 min-w-0">
                        <span className="sr-only">Type a message</span>
                        <textarea
                          ref={composerRef}
                          rows={1}
                          value={messageText}
                          onChange={(e) => handleInputChange(e as unknown as React.ChangeEvent<HTMLInputElement>)}
                          onKeyDown={handleComposerKeyDown}
                          placeholder={activeTab === "class" ? "Message your class" : "Type a message"}
                          className="block w-full resize-none rounded-3xl bg-white border border-[#ebebeb] px-4 py-[10px] text-base md:text-[14px] leading-[22px] text-[#111111] placeholder:text-[#8a8a8a] outline-none focus:border-[#c4c4c4] focus-visible:ring-2 focus-visible:ring-[#1a1917]/10 max-h-[132px] min-h-11"
                        />
                      </label>
                      <button
                        type="submit"
                        disabled={!canSend}
                        aria-label="Send message"
                        className={`size-11 shrink-0 rounded-full flex items-center justify-center transition-colors ${focusRing} ${
                          canSend ? "bg-[#1a1917] text-white hover:bg-[#333]" : "bg-[#ebebeb] text-[#a3a3a3] cursor-not-allowed"
                        }`}
                      >
                        <Send className="size-[18px] -ml-0.5" aria-hidden="true" />
                      </button>
                    </div>
                    <p className="hidden md:block text-[10.5px] text-[#a3a3a3] mt-1 pl-14">Enter to send · Shift + Enter for a new line</p>
                  </form>
                )}
              </>
            )}
          </>
        )}
      </section>

      {/* Request Chat Modal popup */}
      <AnimatePresence>
        {selectedFaculty && (
          <div className="fixed inset-0 bg-black/35 backdrop-blur-sm z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="request-chat-title">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="w-full max-w-md bg-white p-6 rounded-3xl border border-[#dedede] shadow-lg text-left"
            >
              <h4 id="request-chat-title" className="text-sm font-bold text-[#1a1917] mb-1">Send Private Chat Request</h4>
              <p className="text-[12px] text-[#8a8a8a] mb-4">
                Requesting chat with: <b className="text-[#1a1917]">{selectedFaculty.name}</b> ({selectedFaculty.department})
              </p>

              <form onSubmit={handleRequestSubmit} className="space-y-4">
                <div>
                  <label htmlFor="req-subject" className="text-[11px] font-bold text-[#676767] uppercase tracking-wider block mb-1">
                    Subject
                  </label>
                  <Input
                    id="req-subject"
                    type="text"
                    placeholder="e.g. Operating Systems Lab 2 Doubt"
                    value={requestSubject}
                    onChange={(e) => setRequestSubject(e.target.value)}
                    className="h-10 text-base md:text-xs"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="req-reason" className="text-[11px] font-bold text-[#676767] uppercase tracking-wider block mb-1">
                    Reason / Description
                  </label>
                  <Textarea
                    id="req-reason"
                    placeholder="Please provide details for the chat discussion request..."
                    value={requestReason}
                    onChange={(e) => setRequestReason(e.target.value)}
                    className="text-base md:text-xs min-h-[90px]"
                    required
                  />
                </div>

                <div className="pt-2 border-t border-[#ebebeb] flex items-center justify-between">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setSelectedFaculty(null)}
                    className="h-10 px-4 text-xs font-semibold hover:bg-neutral-100"
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isSubmittingRequest} className="h-10 px-5 text-xs font-semibold bg-[#1a1917] hover:bg-[#333]">
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
          <div className="fixed inset-0 bg-black/35 backdrop-blur-sm z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="section-formats-title">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="w-full max-w-sm bg-white p-6 rounded-3xl border border-[#dedede] shadow-lg text-left"
            >
              <h4 id="section-formats-title" className="text-sm font-bold text-[#1a1917] mb-2 flex items-center gap-1.5">
                <AlertCircle className="size-4.5 text-[#676767]" aria-hidden="true" />
                Accepted Section Formats
              </h4>
              <p className="text-xs text-[#676767] leading-[1.45] mb-4">
                To access class chat channels, your section must exactly match the format of{" "}
                <span className="font-semibold">[DEPT_PREFIX]-[SECTION_LETTER]</span>:
              </p>

              <div className="bg-[#f4f4f4] p-3 rounded-2xl border border-[#ebebeb] space-y-1.5 text-xs font-semibold text-[#1a1917] mb-4">
                <div>💻 CSE Department: <span className="font-mono">CSE-A</span>, <span className="font-mono">CSE-B</span></div>
                <div>📡 ECE Department: <span className="font-mono">ECE-A</span>, <span className="font-mono">ECE-B</span></div>
                <div>⚙️ MECH Department: <span className="font-mono">MEC-A</span>, <span className="font-mono">MEC-B</span></div>
                <div>🔌 EEE Department: <span className="font-mono">EEE-A</span>, <span className="font-mono">EEE-B</span></div>
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={() => setShowSectionFormatsModal(false)}
                  className="h-10 px-4 text-xs font-semibold bg-[#1a1917] hover:bg-[#333] rounded-lg shadow-none"
                >
                  Understood
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Module-level presentational helpers (not exported)
// ---------------------------------------------------------------------------
const GROUP_GAP_MS = 10 * 60 * 1000;

function safeDate(value: any): Date {
  const d = value ? new Date(value) : new Date();
  return isNaN(d.getTime()) ? new Date() : d;
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function dayKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayLabel(d: Date) {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(d, now)) return "Today";
  if (sameDay(d, yesterday)) return "Yesterday";
  const diffDays = (now.getTime() - d.getTime()) / 86400000;
  if (diffDays > 0 && diffDays < 7) return d.toLocaleDateString([], { weekday: "long" });
  return d.toLocaleDateString([], {
    day: "numeric",
    month: "short",
    ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" as const } : {}),
  });
}

function formatListTime(value: any) {
  if (!value) return "";
  const d = safeDate(value);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(d, now)) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (sameDay(d, yesterday)) return "Yesterday";
  return d.toLocaleDateString([], { day: "numeric", month: "short" });
}

function initials(name?: string) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

const NAME_COLORS = ["#4f6b8a", "#7a5c8a", "#4f7a6a", "#8a6a4f", "#6a6a8a", "#8a4f5c", "#5c7a4f", "#4f7a85"];
function nameColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return NAME_COLORS[h % NAME_COLORS.length];
}

function groupReactions(reactions: any[]) {
  const map = new Map<string, { emoji: string; count: number; names: string[] }>();
  reactions.forEach((r) => {
    if (!r?.emoji) return;
    const g = map.get(r.emoji) || { emoji: r.emoji, count: 0, names: [] };
    g.count += 1;
    if (r.userName) g.names.push(r.userName);
    map.set(r.emoji, g);
  });
  return Array.from(map.values());
}
