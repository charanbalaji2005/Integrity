import React, { useState, useEffect } from "react";
import {
  LifeBuoy,
  MessageSquare,
  Users,
  CheckCircle2,
  Clock,
  LogOut,
  Send,
  User,
  Shield,
  Search,
  Sparkles,
  BarChart3,
  Calendar,
  AlertTriangle,
  FileText,
  Info
} from "lucide-react";
import { Button } from "../components/ui/button";
import { toast } from "sonner";
import imgAssessmentIntegrityLogo from "../../imports/LoginPortalIntegrityOs/assessment_integrity_logo.png";
import { SupportConsoleLogo } from "../components/SupportConsoleLogo";
import { ChatbotIcon } from "../components/ChatbotIcon";
import { motion } from "motion/react";
import { NotificationCenter } from "../components/NotificationCenter";

interface SupportDashboardViewProps {
  user: any;
  session: any;
  handleLogout: () => void;
}

export function SupportDashboardView({ user, session, handleLogout }: SupportDashboardViewProps) {
  const [activeTab, setActiveTab] = useState("Overview");
  
  // Support state lists
  const [tickets, setTickets] = useState<any[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [newMessage, setNewMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isDetailsOpen, setIsDetailsOpen] = useState(true);
  const [showMetadata, setShowMetadata] = useState(false);
  const [showLogsPermission, setShowLogsPermission] = useState(false);

  // Stats Analytics state
  const [analytics, setAnalytics] = useState<any>({
    activeChats: 0,
    pendingTickets: 0,
    csatScore: "4.8 / 5.0",
    resolutionRate: 0
  });

  // Fetch support queue tickets from API
  const fetchTickets = async () => {
    setIsLoading(true);
    try {
      const headers = {
        "x-user-id": user.id,
        "x-user-role": "support"
      };

      const [ticketsRes, analyticsRes] = await Promise.all([
        fetch("/api/support/tickets", { headers }),
        fetch("/api/support/analytics", { headers })
      ]);

      if (ticketsRes.ok) {
        const data = await ticketsRes.json();
        setTickets(data.data || []);
      }

      if (analyticsRes.ok) {
        const data = await analyticsRes.json();
        setAnalytics(data.data || {
          activeChats: 0,
          pendingTickets: 0,
          csatScore: "4.8 / 5.0",
          resolutionRate: 0
        });
      }
    } catch (err) {
      console.error("Failed to fetch tickets:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTickets();
  }, [user.id]);

  // Periodic polling for proctoring dashboard
  useEffect(() => {
    const interval = setInterval(fetchTickets, 5000);
    return () => clearInterval(interval);
  }, [user.id]);

  // Synchronize selected ticket with updated tickets list (from polling)
  useEffect(() => {
    if (selectedTicket) {
      const updated = tickets.find((t) => t.id === selectedTicket.id);
      if (updated) {
        setSelectedTicket(updated);
      }
    }
  }, [tickets, selectedTicket]);

  // Handle support ticket messages
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newMessage.trim() || !selectedTicket) return;

    try {
      const res = await fetch(`/api/support/tickets/${selectedTicket.id}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": user.id,
          "x-user-role": "support"
        },
        body: JSON.stringify({
          content: newMessage,
          senderName: user.name,
          senderRole: "support"
        })
      });
      
      if (res.ok) {
        setNewMessage("");
        fetchTickets();
        
        // Force refresh active ticket from refreshed ticket list
        const updatedRes = await fetch("/api/support/tickets", {
          headers: { "x-user-id": user.id, "x-user-role": "support" }
        });
        if (updatedRes.ok) {
          const uData = await updatedRes.json();
          const found = uData.data.find((t: any) => t.id === selectedTicket.id);
          if (found) {
            setSelectedTicket(found);
          }
        }
      }
    } catch (err) {
      console.error("Failed to send message:", err);
    }
  };

  // Assign or update ticket status
  const handleUpdateStatus = async (ticketId: string, newStatus: string) => {
    try {
      const body: any = { status: newStatus };
      if (newStatus === "active") {
        body.assignedAgentId = user.id;
        body.assignedAgentName = user.name;
      }
      const res = await fetch(`/api/support/tickets/${ticketId}/status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": user.id,
          "x-user-role": "support"
        },
        body: JSON.stringify(body)
      });
      if (res.ok) {
        toast.success(`Ticket status updated to ${newStatus}`);
        fetchTickets();
        if (selectedTicket && selectedTicket.id === ticketId) {
          setSelectedTicket({ ...selectedTicket, status: newStatus, assignedAgentId: user.id, assignedAgentName: user.name });
        }
      }
    } catch (err) {
      console.error("Failed to update status:", err);
    }
  };

  const filteredTickets = tickets.filter(t => {
    return (t.studentName || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
           (t.referenceNumber || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
           (t.category || "").toLowerCase().includes(searchQuery.toLowerCase());
  });

  return (
    <div className="flex h-screen w-full text-[#1a1917] bg-[#faf9f6]">
      {/* Sidebar Navigation */}
      <aside className="w-60 bg-white border-r border-[#ebdcc9] flex flex-col justify-between shrink-0 p-5 select-none">
        <div className="flex flex-col gap-6">
          <div className="flex items-center gap-3 pb-4 border-b border-[#ebdcc9]/40">
            <div className="flex items-center justify-center shrink-0">
              <SupportConsoleLogo className="h-6 w-auto" />
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="font-extrabold text-[13px] leading-none text-[#1a1917]">Support Portal</span>
              <span className="text-[10px] text-[#8e8a80] font-semibold leading-none">Console Controller</span>
            </div>
          </div>

          <nav className="flex flex-col gap-1">
            {[
              { name: "Overview", icon: BarChart3 },
              { name: "Live Queue", icon: MessageSquare }
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.name;
              return (
                <button
                  key={tab.name}
                  onClick={() => setActiveTab(tab.name)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer border-none outline-none ${
                    isActive
                      ? "bg-zinc-950 text-white shadow-md"
                      : "text-[#6b6861] hover:text-[#1a1917] hover:bg-[#ebdcc9]/25"
                  }`}
                >
                  <Icon className="size-4 shrink-0" />
                  {tab.name}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="flex flex-col gap-3 pt-4 border-t border-[#ebdcc9]/40 mt-6 md:mt-0">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50 cursor-pointer border-none outline-none transition"
          >
            <LogOut className="size-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Panel */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b border-[#ebdcc9] bg-white/70 backdrop-blur-md px-6 md:px-8 flex items-center justify-between sticky top-0 z-20">
          <div className="flex items-center gap-2">
            <LifeBuoy className="size-5 text-[#c5af8a] animate-spin-slow" />
            <span className="text-[13.5px] font-bold text-[#1a1917]">Support Hub Console</span>
          </div>

          <div className="flex items-center gap-3">
            <NotificationCenter />
            <div 
              onClick={() => window.dispatchEvent(new CustomEvent("open-profile-drawer"))}
              className="flex items-center gap-3 cursor-pointer hover:opacity-85 transition-opacity"
            >
              <div className="text-right hidden sm:block">
                <div className="text-[13.5px] font-bold leading-tight text-[#1a1917]">{user.name}</div>
                <div className="text-[11px] font-semibold text-[#8e8a80] leading-none mt-0.5">Support Representative</div>
              </div>
              <div className="w-9 h-9 rounded-full bg-[#1a1917] border border-[#c5af8a] text-white flex items-center justify-center font-bold text-sm">
                {user.name.charAt(0).toUpperCase()}
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 p-6 md:p-8 space-y-6 overflow-y-auto">
          {activeTab === "Overview" ? (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Support Overview</h1>
                <p className="text-xs text-[#8e8a80]">Manage user communication queues, resolve technical tickets, and monitor satisfaction rates.</p>
              </div>

              {/* Stats cards grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                <motion.div
                  whileHover={{ y: -5, scale: 1.03, boxShadow: "0 10px 20px -5px rgba(142,126,98,0.12), 0 0 0 1px rgba(197, 175, 138, 0.3)" }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                  className="bg-white border border-[#ebdcc9] rounded-2xl p-5 shadow-sm transition-all duration-300"
                >
                  <span className="text-[11px] font-bold text-[#8e8a80] uppercase tracking-wider">Active Live Chats</span>
                  <div className="text-3xl font-extrabold mt-1 text-emerald-600">{analytics.activeChats}</div>
                  <span className="text-[11.5px] text-[#6b6760] mt-1.5 block">Conversations in progress</span>
                </motion.div>

                <motion.div
                  whileHover={{ y: -5, scale: 1.03, boxShadow: "0 10px 20px -5px rgba(142,126,98,0.12), 0 0 0 1px rgba(197, 175, 138, 0.3)" }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                  className="bg-white border border-[#ebdcc9] rounded-2xl p-5 shadow-sm transition-all duration-300"
                >
                  <span className="text-[11px] font-bold text-[#8e8a80] uppercase tracking-wider">Pending Tickets</span>
                  <div className="text-3xl font-extrabold mt-1 text-[#b45309]">{analytics.pendingTickets}</div>
                  <span className="text-[11.5px] text-[#6b6760] mt-1.5 block">Waiting in triage queue</span>
                </motion.div>

                <motion.div
                  whileHover={{ y: -5, scale: 1.03, boxShadow: "0 10px 20px -5px rgba(142,126,98,0.12), 0 0 0 1px rgba(197, 175, 138, 0.3)" }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                  className="bg-white border border-[#ebdcc9] rounded-2xl p-5 shadow-sm transition-all duration-300"
                >
                  <span className="text-[11px] font-bold text-[#8e8a80] uppercase tracking-wider">CSAT Score</span>
                  <div className="text-3xl font-extrabold mt-1 text-[#c5af8a]">{analytics.csatScore}</div>
                  <span className="text-[11.5px] text-[#6b6760] mt-1.5 block">Average user rating</span>
                </motion.div>

                <motion.div
                  whileHover={{ y: -5, scale: 1.03, boxShadow: "0 10px 20px -5px rgba(142,126,98,0.12), 0 0 0 1px rgba(197, 175, 138, 0.3)" }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                  className="bg-white border border-[#ebdcc9] rounded-2xl p-5 shadow-sm transition-all duration-300"
                >
                  <span className="text-[11px] font-bold text-[#8e8a80] uppercase tracking-wider">Resolution Rate</span>
                  <div className="text-3xl font-extrabold mt-1 text-zinc-800">{analytics.resolutionRate}%</div>
                  <span className="text-[11.5px] text-[#6b6760] mt-1.5 block">Of total requests resolved</span>
                </motion.div>
              </div>

              {/* Recent tickets quick look */}
              <div className="bg-white border border-[#ebdcc9] rounded-2xl p-5 shadow-sm">
                <h3 className="text-base font-bold mb-4">Active Support Queue</h3>
                {tickets.length === 0 ? (
                  <div className="py-10 text-center text-[#8e8a80]">No active requests in support queue.</div>
                ) : (
                  <div className="space-y-3">
                    {tickets.slice(0, 5).map((ticket) => (
                      <div
                        key={ticket.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-[#FAF6EE]/20 hover:bg-[#FAF6EE]/50 border border-[#ebdcc9]/60 rounded-xl hover:shadow-md hover:border-[#c5af8a]/50 transition-all duration-300 gap-4"
                      >
                        <div className="flex flex-col gap-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono font-bold text-xs text-[#1a1917] bg-[#f0ece4] px-1.5 py-0.5 rounded">{ticket.referenceNumber}</span>
                            <span className="text-[10px] text-[#8e8a80] font-semibold uppercase tracking-wider">{ticket.category.replace("-", " ")}</span>
                          </div>
                          <span className="font-bold text-[#1a1917] text-sm truncate">{ticket.studentName}</span>
                        </div>

                        <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border capitalize ${
                            ticket.priority === "high"
                              ? "bg-rose-50 border-rose-100 text-rose-600"
                              : ticket.priority === "medium"
                              ? "bg-[#FAF0DD] border-[#e3d5ba] text-[#9a7b4f]"
                              : "bg-emerald-50 border-emerald-100 text-emerald-600"
                          }`}>
                            {ticket.priority}
                          </span>

                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border capitalize ${
                            ticket.status === "resolved"
                              ? "bg-zinc-50 border-zinc-100 text-zinc-600"
                              : ticket.status === "active"
                              ? "bg-emerald-50 border-emerald-100 text-emerald-600"
                              : "bg-[#FAF0DD] border-[#e3d5ba] text-[#9a7b4f] animate-pulse"
                          }`}>
                            {ticket.status}
                          </span>

                          <button
                            type="button"
                            onClick={() => {
                              setSelectedTicket(ticket);
                              setActiveTab("Support Queue");
                            }}
                            className="text-xs font-bold text-white bg-black hover:bg-zinc-800 px-3 py-1.5 rounded-lg shadow-sm transition active:scale-95 cursor-pointer"
                          >
                            View Chat
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-12rem)] min-h-[500px]">
              {/* Left Panel: Tickets List */}
              <div className="bg-white border border-[#ebdcc9] rounded-2xl p-4 shadow-sm flex flex-col h-full">
                <div className="mb-4">
                  <h2 className="text-lg font-bold tracking-tight">Triage Tickets</h2>
                  <p className="text-xs text-[#8e8a80] mt-0.5">Select a ticket to review context and chat.</p>
                </div>

                <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                  {tickets.length === 0 ? (
                    <div className="py-8 text-center text-xs text-[#8e8a80]">No active requests.</div>
                  ) : (
                    tickets.map((t) => {
                      const isSelected = selectedTicket && selectedTicket.id === t.id;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setSelectedTicket(t)}
                          className={`w-full text-left p-3.5 rounded-xl border transition-all cursor-pointer ${
                            isSelected
                              ? "bg-[#FAF6EE] border-[#c5af8a]"
                              : "bg-white hover:bg-[#FAF6EE]/40 border-[#ebdcc9]/40"
                          }`}
                        >
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-xs font-mono font-bold text-[#8e8a80]">{t.referenceNumber}</span>
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border capitalize ${
                              t.status === "resolved"
                                ? "bg-zinc-50 border-zinc-100 text-zinc-500"
                                : t.status === "active"
                                ? "bg-emerald-50 border-emerald-100 text-emerald-600"
                                : "bg-[#FAF0DD] border-[#e3d5ba] text-[#9a7b4f] animate-pulse"
                            }`}>
                              {t.status}
                            </span>
                          </div>
                          <span className="text-sm font-bold text-[#1a1917] block truncate">{t.studentName}</span>
                          <span className="text-xs text-[#6b6760] block truncate mt-0.5">{t.description}</span>
                          <div className="flex items-center gap-1.5 mt-2">
                            <span className="text-[10px] bg-[#f0ece4] text-[#6b6760] px-2 py-0.5 rounded-md font-semibold">
                              {t.category.replace("-", " ")}
                            </span>
                            <span className={`text-[10px] px-2 py-0.5 rounded-md font-semibold ${
                              t.priority === "high" ? "bg-rose-50 text-rose-600" : "bg-[#FAF0DD] text-[#9a7b4f]"
                            }`}>
                              {t.priority}
                            </span>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Right Workspace (2 columns on large screens) */}
              <div className="lg:col-span-2 flex flex-col h-full bg-white border border-[#ebdcc9]/60 rounded-2xl overflow-hidden shadow-sm">
                {selectedTicket ? (
                  <div className="flex flex-col h-full">
                    {/* Header */}
                    <div className="p-4 border-b border-[#ebdcc9]/40 flex justify-between items-center bg-[#FAF6EE]/30 shrink-0">
                      <div>
                        <span className="text-[11px] font-mono font-bold text-[#8e8a80]">{selectedTicket.referenceNumber}</span>
                        <h3 className="text-sm font-bold text-[#1a1917]">{selectedTicket.studentName}</h3>
                      </div>

                      <div className="flex gap-2">
                        {selectedTicket.status === "pending" && (
                          <button
                            type="button"
                            onClick={() => handleUpdateStatus(selectedTicket.id, "active")}
                            className="text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 px-3 py-1.5 rounded-lg transition"
                          >
                            Join Chat
                          </button>
                        )}
                        {selectedTicket.status !== "resolved" && (
                          <button
                            type="button"
                            onClick={() => {
                              const details = prompt("Enter resolution details:");
                              if (details !== null) {
                                handleUpdateStatus(selectedTicket.id, "resolved", details);
                              }
                            }}
                            className="text-xs font-bold bg-black text-white hover:bg-zinc-800 px-3 py-1.5 rounded-lg transition"
                          >
                            Mark Resolved
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setShowMetadata(!showMetadata)}
                          className={`p-1.5 rounded-lg border transition-all ${
                            showMetadata
                              ? "bg-zinc-950 text-white border-zinc-950"
                              : "bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50"
                          }`}
                          title="Toggle User Details"
                        >
                          <Info className="size-4" />
                        </button>
                      </div>
                    </div>

                    {/* Chat Messages + Collapsible Metadata side-by-side */}
                    <div className="flex-1 flex overflow-hidden">
                      {/* Chat Messages Workspace */}
                      <div className="flex-1 flex flex-col min-w-0 h-full">
                        {/* Chat Messages */}
                        <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-zinc-950 text-white">
                          <div className="rounded-xl p-3 bg-zinc-900 border border-zinc-800 text-xs leading-relaxed text-zinc-300">
                            <span className="font-bold text-white block mb-1">Issue Details:</span>
                            {selectedTicket.description}
                          </div>

                          {selectedTicket.messages?.map((msg: any) => {
                            const isSupport = msg.senderRole === "support";
                            const isAI = msg.senderRole === "ai";
                            return (
                              <div
                                key={msg.id}
                                className={`flex gap-2.5 max-w-[80%] items-start ${
                                  isSupport ? "ml-auto" : "mr-auto"
                                }`}
                              >
                                {isAI && <ChatbotIcon className="size-6 mt-0.5" />}
                                <div
                                  className={`flex flex-col rounded-2xl p-3 text-xs leading-relaxed ${
                                    isSupport
                                      ? "bg-zinc-200 text-zinc-900 border border-zinc-300"
                                      : isAI
                                      ? "bg-white text-zinc-900 border border-zinc-200 shadow-[0_0_12px_rgba(255,255,255,0.15)]"
                                      : "bg-white border border-zinc-200 text-zinc-900"
                                  }`}
                                >
                                  <span className="font-bold block mb-1 text-[10px] text-zinc-400">
                                    {isAI ? "Integrity Assistant" : msg.senderName}
                                  </span>
                                  <span className="font-medium text-zinc-900">{msg.content}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Message Input */}
                        {selectedTicket.status !== "resolved" && (
                          <div className="p-3 border-t border-[#ebdcc9]/40 flex gap-2 bg-white shrink-0">
                            <input
                              type="text"
                              value={newMessage}
                              onChange={(e) => setNewMessage(e.target.value)}
                              onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                              placeholder="Type a message to the user..."
                              className="flex-1 bg-[#FAF6EE] border border-[#ebdcc9]/60 rounded-xl px-4 py-2 text-xs placeholder:text-[#a7a297] text-[#1a1917] focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={handleSendMessage}
                              className="bg-[#1a1917] text-white p-2 rounded-xl hover:bg-black transition flex items-center justify-center cursor-pointer"
                            >
                              <Send className="size-4" />
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Collapsible Metadata Panel */}
                      {showMetadata && (
                        <div className="w-72 bg-white border-l border-[#ebdcc9]/60 p-5 overflow-y-auto hidden md:flex flex-col gap-4 shrink-0">
                          <div>
                            <h4 className="text-[10px] font-bold text-[#8e8a80] uppercase tracking-wider">User Profile</h4>
                            <div className="mt-2 space-y-1.5 text-xs text-[#1a1917]">
                              <p><span className="text-[#8e8a80] font-medium">Name:</span> {selectedTicket.studentName}</p>
                              <p><span className="text-[#8e8a80] font-medium">Email:</span> {selectedTicket.email}</p>
                              <p><span className="text-[#8e8a80] font-medium">Queue Position:</span> #{selectedTicket.queuePosition || "-"}</p>
                              <p><span className="text-[#8e8a80] font-medium">Category:</span> <span className="capitalize">{selectedTicket.category.replace("-", " ")}</span></p>
                            </div>
                          </div>

                          <div className="border-t border-[#ebdcc9]/40 pt-3">
                            <div className="flex items-center gap-2 mb-2 text-xs font-bold text-amber-800">
                              <Shield className="size-4 text-[#c5af8a]" />
                              <span>Role-Based Verification</span>
                            </div>
                            <p className="text-[10.5px] leading-relaxed text-[#8e8a80]">
                              Access to proctoring webcam capture logs, tab-switch alerts, and browser logs is restricted. Review user consent credentials below.
                            </p>

                            <button
                              type="button"
                              onClick={() => {
                                setShowLogsPermission(!showLogsPermission);
                                toast.success("Security authorization cleared.");
                              }}
                              className="w-full mt-3 bg-black hover:bg-zinc-800 text-white text-[11px] font-bold py-2 rounded-xl transition"
                            >
                              {showLogsPermission ? "Revoke System Access" : "Verify Clearances"}
                            </button>
                          </div>

                          {showLogsPermission && (
                            <div className="border-t border-[#ebdcc9]/40 pt-3 space-y-2">
                              <h5 className="text-[10px] font-bold text-[#8e8a80] uppercase tracking-wider flex items-center gap-1">
                                <AlertTriangle className="size-3.5 text-amber-500" /> Live Assessment Logs
                              </h5>
                              <div className="p-2.5 rounded-lg bg-[#FAF6EE] border border-[#ebdcc9] text-[10px] font-mono leading-relaxed space-y-1">
                                <p className="text-rose-600">[ALERT] Tab Switch Event: 23:42:01</p>
                                <p className="text-rose-600">[ALERT] No Face Detected: 23:42:15</p>
                                <p className="text-[#8e8a80]">[INFO] Network Ping: 23.4 ms</p>
                                <p className="text-[#8e8a80]">[INFO] Webcam verification: Verified</p>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-[#8e8a80]">
                    <LifeBuoy className="size-12 mb-3 text-[#ebdcc9] animate-bounce" />
                    <p className="text-sm font-bold">No Ticket Selected</p>
                    <p className="text-xs max-w-xs mt-1">Choose a ticket from the sidebar queue to read conversation details, assign agents, and respond.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
