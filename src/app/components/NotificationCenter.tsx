import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Bell, 
  Trash2, 
  Check, 
  BookOpen, 
  AlertTriangle, 
  AlertCircle, 
  Cpu, 
  MessageSquare,
  Volume2
} from "lucide-react";
import { useNotifications, Notification } from "../context/NotificationContext";
import { formatDistanceToNow, isToday, isYesterday } from "date-fns";

export const NotificationCenter: React.FC = () => {
  const { 
    notifications, 
    unreadCount, 
    markAsRead, 
    markAllAsRead, 
    deleteNotification 
  } = useNotifications();

  const [isOpen, setIsOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const getCategoryIcon = (type: string) => {
    switch (type) {
      case "announcement": return <Volume2 className="size-4 text-amber-600" />;
      case "assessment": return <BookOpen className="size-4 text-indigo-600" />;
      case "report": return <AlertTriangle className="size-4 text-rose-600" />;
      case "system": return <Cpu className="size-4 text-zinc-700" />;
      case "message": return <MessageSquare className="size-4 text-sky-600" />;
      default: return <AlertCircle className="size-4 text-zinc-500" />;
    }
  };

  const getPriorityBadgeClass = (priority: string) => {
    switch (priority) {
      case "high": return "bg-rose-50 border border-rose-200 text-rose-600";
      case "medium": return "bg-amber-50 border border-amber-200 text-amber-700";
      case "low": return "bg-emerald-50 border border-emerald-200 text-emerald-600";
      default: return "bg-zinc-50 border border-zinc-200 text-zinc-500";
    }
  };

  const filteredNotifications = notifications.filter(n => {
    if (activeFilter === "all") return true;
    if (activeFilter === "unread") return !n.read;
    return n.type === activeFilter;
  });

  // Categorize notifications
  const todayNotifs = filteredNotifications.filter(n => isToday(new Date(n.createdAt)));
  const yesterdayNotifs = filteredNotifications.filter(n => isYesterday(new Date(n.createdAt)));
  const earlierNotifs = filteredNotifications.filter(n => !isToday(new Date(n.createdAt)) && !isYesterday(new Date(n.createdAt)));

  return (
    <div className="relative z-40" ref={dropdownRef}>
      {/* Trigger Bell Button */}
      <motion.button 
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className="p-2 text-zinc-650 hover:text-zinc-950 hover:bg-[#FAF6EE] rounded-xl transition cursor-pointer relative focus:outline-none"
      >
        <motion.div
          animate={isOpen ? { rotate: [0, -15, 15, -10, 10, 0] } : unreadCount > 0 ? {
            rotate: [0, -10, 10, -10, 10, 0],
            transition: { repeat: Infinity, repeatDelay: 3, duration: 0.5 }
          } : {}}
          transition={isOpen ? { duration: 0.4 } : undefined}
        >
          <Bell className="size-5" />
        </motion.div>
        {unreadCount > 0 && (
          <motion.span 
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute top-1.5 right-1.5 min-w-4 h-4 px-1 flex items-center justify-center bg-rose-500 text-white rounded-full text-[9px] font-bold border border-white leading-none shadow-sm"
          >
            {unreadCount}
          </motion.span>
        )}
      </motion.button>

      {/* Dropdown Container */}
      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.92, y: -15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: -15 }}
            transition={{ type: "spring", damping: 18, stiffness: 150 }}
            className="absolute right-0 mt-2 w-[380px] bg-white/95 backdrop-blur-md border border-[#ebdcc9] shadow-2xl rounded-2xl overflow-hidden text-xs text-zinc-800"
          >
            {/* Header */}
            <div className="p-4 border-b border-[#ebdcc9]/40 flex justify-between items-center bg-[#faf9f6]">
              <div>
                <h3 className="font-extrabold text-sm text-[#1a1917]">Notifications</h3>
                <p className="text-[10px] text-[#8e8a80] font-medium mt-0.5">
                  You have {unreadCount} unread notification{unreadCount !== 1 && "s"}
                </p>
              </div>
              {unreadCount > 0 && (
                <button 
                  onClick={markAllAsRead}
                  className="flex items-center gap-1 text-[10px] font-bold text-zinc-950 hover:underline cursor-pointer border-none outline-none"
                >
                  <Check className="size-3.5" /> Mark all read
                </button>
              )}
            </div>

            {/* Filter Pills */}
            <div className="px-4 py-2 bg-zinc-50/50 border-b border-[#ebdcc9]/30 flex items-center gap-1.5 overflow-x-auto scrollbar-none">
              {[
                { id: "all", label: "All" },
                { id: "unread", label: "Unread" },
                { id: "announcement", label: "Broadcasts" },
                { id: "assessment", label: "Exams" },
                { id: "report", label: "Reports" },
                { id: "system", label: "System" }
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => setActiveFilter(f.id)}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-bold border transition-all cursor-pointer ${
                    activeFilter === f.id
                      ? "bg-zinc-950 border-zinc-950 text-white shadow-sm"
                      : "bg-white border-[#ebdcc9] text-zinc-650 hover:bg-zinc-50"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Notification Lists */}
            <div className="max-h-[360px] overflow-y-auto divide-y divide-[#ebdcc9]/20 pr-1">
              {filteredNotifications.length === 0 ? (
                <div className="py-12 text-center text-zinc-400 flex flex-col items-center justify-center gap-2">
                  <div className="p-3 bg-zinc-50 border rounded-2xl">
                    <Bell className="size-6 text-zinc-300" />
                  </div>
                  <span className="font-bold text-zinc-800 text-[11px]">All caught up!</span>
                  <span className="text-[10px] text-zinc-400">No notifications in this filter category.</span>
                </div>
              ) : (
                <div className="p-2 space-y-3">
                  {todayNotifs.length > 0 && (
                    <div className="space-y-1">
                      <span className="px-2 text-[9px] font-extrabold text-[#8e8a80] uppercase tracking-wider block mb-1">Today</span>
                      <AnimatePresence initial={false}>
                        {todayNotifs.map(n => renderCard(n, markAsRead, deleteNotification, getCategoryIcon, getPriorityBadgeClass))}
                      </AnimatePresence>
                    </div>
                  )}

                  {yesterdayNotifs.length > 0 && (
                    <div className="space-y-1">
                      <span className="px-2 text-[9px] font-extrabold text-[#8e8a80] uppercase tracking-wider block mb-1">Yesterday</span>
                      <AnimatePresence initial={false}>
                        {yesterdayNotifs.map(n => renderCard(n, markAsRead, deleteNotification, getCategoryIcon, getPriorityBadgeClass))}
                      </AnimatePresence>
                    </div>
                  )}

                  {earlierNotifs.length > 0 && (
                    <div className="space-y-1">
                      <span className="px-2 text-[9px] font-extrabold text-[#8e8a80] uppercase tracking-wider block mb-1">Earlier</span>
                      <AnimatePresence initial={false}>
                        {earlierNotifs.map(n => renderCard(n, markAsRead, deleteNotification, getCategoryIcon, getPriorityBadgeClass))}
                      </AnimatePresence>
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// Render card item
const renderCard = (
  n: Notification,
  markAsRead: (id: string) => void,
  deleteNotification: (id: string) => void,
  getCategoryIcon: (type: string) => React.ReactNode,
  getPriorityBadgeClass: (priority: string) => string
) => {
  return (
    <motion.div
      key={n.id}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 20 }}
      layout
      onClick={() => !n.read && markAsRead(n.id)}
      className={`group relative p-3 border border-[#ebdcc9]/30 rounded-xl hover:bg-neutral-50/70 transition-all duration-200 cursor-pointer flex gap-3 ${
        !n.read ? "bg-[#FAF8F5]/60 font-medium" : "bg-white text-zinc-550"
      }`}
    >
      {/* Category Icon with glow */}
      <div className="p-2 bg-zinc-50 rounded-xl border border-zinc-150 shrink-0 self-start group-hover:scale-105 transition-transform">
        {getCategoryIcon(n.type)}
      </div>

      {/* Info Details */}
      <div className="flex-1 min-w-0 pr-6 space-y-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-extrabold text-zinc-900 leading-none">
            {n.senderName || "System"}
          </span>
          {n.senderRole && (
            <span className="text-[8.5px] px-1 bg-zinc-100 border text-[#8e8a80] rounded border-zinc-200 font-bold uppercase py-0.2 select-none leading-none">
              {n.senderRole}
            </span>
          )}
        </div>

        <p className={`text-zinc-800 text-[11px] leading-tight ${!n.read ? "font-bold" : "font-normal"}`}>
          {n.title}
        </p>
        <p className="text-[10px] text-zinc-500 leading-snug break-words">
          {n.description}
        </p>

        <div className="flex items-center gap-2 pt-1 flex-wrap">
          <span className="text-[9px] font-mono text-zinc-400 shrink-0">
            {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
          </span>
          <span className={`text-[8.5px] px-1.5 rounded-full font-bold uppercase select-none leading-none py-0.2 shrink-0 ${getPriorityBadgeClass(n.priority)}`}>
            {n.priority}
          </span>
        </div>
      </div>

      {/* Delete / Read indicator controls */}
      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
        {!n.read && (
          <span className="size-2 bg-rose-500 rounded-full border border-white" />
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            deleteNotification(n.id);
          }}
          className="p-1 rounded text-zinc-400 hover:text-rose-600 hover:bg-rose-50 opacity-0 group-hover:opacity-100 transition cursor-pointer border-none outline-none"
          title="Delete update"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
    </motion.div>
  );
};
