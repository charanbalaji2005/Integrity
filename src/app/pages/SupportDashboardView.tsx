import React, { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  Bot,
  CheckCircle2,
  Inbox,
  LayoutDashboard,
  MessageSquare,
  Settings2,
  UserCheck,
  Users,
} from "lucide-react";
import { SidebarProvider, SidebarTrigger } from "../components/ui/sidebar";
import { PortalSidebar, type PortalNavGroup } from "../components/PortalSidebar";
import { openSettings } from "../settings/SettingsCenter";
import { errorMessage, supportApi } from "../components/support-hub/api";
import { HubHeader } from "../components/support-hub/Header";
import { OverviewView } from "../components/support-hub/OverviewView";
import { QueueWorkspace } from "../components/support-hub/QueueWorkspace";
import { StaffView } from "../components/support-hub/StaffView";
import { AnalyticsView } from "../components/support-hub/AnalyticsView";
import { KnowledgeBaseView } from "../components/support-hub/KnowledgeBaseView";
import { SettingsView } from "../components/support-hub/SettingsView";
import { AGENT_EVENTS, SupportSocketProvider, TICKET_EVENTS, useSocketEvent, useSupportSocket } from "../components/support-hub/socket";
import type { Availability, HubSection, QueueCounts, QueueResponse, StaffProfile, SupportNotification } from "../components/support-hub/types";
import { AVAILABILITY_LABEL, SECTION_VIEW } from "../components/support-hub/types";

interface SupportDashboardViewProps {
  user: any;
  session: any;
  handleLogout: () => void;
}

const SUPERVISOR_SECTIONS: HubSection[] = ["staff", "analytics", "settings"];
const MAX_NOTIFICATIONS = 50;

export function SupportDashboardView({ user, handleLogout }: SupportDashboardViewProps) {
  return (
    <SupportSocketProvider>
      <SupportHubConsole user={user} handleLogout={handleLogout} />
    </SupportSocketProvider>
  );
}

function SupportHubConsole({ user, handleLogout }: { user: any; handleLogout: () => void }) {
  const { connected } = useSupportSocket();
  const [section, setSection] = useState<HubSection>("overview");
  const [openTicketId, setOpenTicketId] = useState<string | null>(null);
  const [me, setMe] = useState<StaffProfile | null>(null);
  const [counts, setCounts] = useState<QueueCounts | null>(null);
  const [availabilityBusy, setAvailabilityBusy] = useState(false);
  const [notifications, setNotifications] = useState<SupportNotification[]>([]);
  const [overviewKey, setOverviewKey] = useState(0);

  const isSupervisor = me?.supportRole === "supervisor" || user?.role === "admin";

  /* ---------------- profile + counts ---------------- */
  const loadMe = useCallback(async () => {
    try {
      setMe(await supportApi<StaffProfile>("/me"));
    } catch (err) {
      console.error("Support profile failed to load", err);
    }
  }, []);

  const loadCounts = useCallback(async () => {
    try {
      const res = await supportApi<QueueResponse>("/queue?view=all");
      setCounts(res.counts);
      if (res.me) setMe(res.me);
    } catch (err) {
      console.error("Queue counts failed to load", err);
    }
  }, []);

  useEffect(() => {
    void loadMe().then(loadCounts);
  }, [loadMe, loadCounts]);

  const countsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleRefresh = useCallback(() => {
    if (countsTimer.current) clearTimeout(countsTimer.current);
    countsTimer.current = setTimeout(() => {
      void loadCounts();
      setOverviewKey((k) => k + 1);
    }, 600);
  }, [loadCounts]);
  useEffect(
    () => () => {
      if (countsTimer.current) clearTimeout(countsTimer.current);
    },
    []
  );

  // Refresh after (re)connecting, since events may have been missed while offline.
  useEffect(() => {
    if (connected) scheduleRefresh();
  }, [connected, scheduleRefresh]);

  useSocketEvent([...TICKET_EVENTS, "chat:handoff"], () => scheduleRefresh());

  useSocketEvent(AGENT_EVENTS, (payload: { staff?: StaffProfile }) => {
    const s = payload?.staff;
    if (s && me && (s.id === me.id || s.userId === me.userId)) setMe(s);
  });

  /* ---------------- navigation ---------------- */
  const openTicket = useCallback((target: HubSection, ticketId: string) => {
    setSection(target);
    setOpenTicketId(ticketId);
  }, []);

  const select = (s: HubSection) => {
    setSection(s);
    setOpenTicketId(null);
  };

  /* ---------------- notifications ---------------- */
  useSocketEvent("notification:new", (payload: { title?: string; description?: string; ticketId?: string; priority?: string }) => {
    if (!payload) return;
    const n: SupportNotification = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: payload.title || "Support notification",
      description: payload.description || "",
      ticketId: payload.ticketId,
      priority: payload.priority,
      at: new Date().toISOString(),
      read: false,
    };
    setNotifications((list) => [n, ...list].slice(0, MAX_NOTIFICATIONS));
    const urgent = payload.priority === "P1" || payload.priority === "P2";
    const opts = {
      description: n.description || undefined,
      action: n.ticketId ? { label: "Open", onClick: () => openTicket("mine", n.ticketId as string) } : undefined,
    };
    if (urgent) toast.warning(n.title, opts);
    else toast(n.title, opts);
    scheduleRefresh();
  });

  const onOpenNotification = (n: SupportNotification) => {
    setNotifications((list) => list.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    if (n.ticketId) openTicket("mine", n.ticketId);
  };

  /* ---------------- availability ---------------- */
  const changeAvailability = async (availability: Availability) => {
    setAvailabilityBusy(true);
    try {
      const p = await supportApi<StaffProfile>("/me/availability", { method: "PUT", body: { availability } });
      setMe(p);
      toast.success(`Status set to ${AVAILABILITY_LABEL[availability] ?? availability}`);
    } catch (err) {
      toast.error(errorMessage(err, "Could not update availability"));
    } finally {
      setAvailabilityBusy(false);
    }
  };

  /* ---------------- content ---------------- */
  const effectiveSection: HubSection = !isSupervisor && SUPERVISOR_SECTIONS.includes(section) ? "overview" : section;
  const queueView = SECTION_VIEW[effectiveSection];

  let content: React.ReactNode;
  if (queueView) {
    content = <QueueWorkspace key={effectiveSection} view={queueView} me={me} initialTicketId={openTicketId} onQueueChanged={scheduleRefresh} />;
  } else if (effectiveSection === "staff") {
    content = <StaffView />;
  } else if (effectiveSection === "analytics") {
    content = <AnalyticsView />;
  } else if (effectiveSection === "kb") {
    content = <KnowledgeBaseView canManage={isSupervisor} />;
  } else if (effectiveSection === "settings") {
    content = <SettingsView canEdit={isSupervisor} />;
  } else {
    content = <OverviewView me={me} refreshKey={overviewKey} onOpenTicket={openTicket} onNavigate={select} />;
  }

  const groups: PortalNavGroup[] = [
    {
      label: "Work",
      items: [
        { id: "overview", label: "Overview", icon: LayoutDashboard },
        { id: "queue", label: "Live Queue", icon: MessageSquare, badge: counts?.all ?? null },
        { id: "mine", label: "My Tickets", icon: UserCheck, badge: counts?.mine ?? null },
        { id: "unassigned", label: "Unassigned", icon: Inbox, badge: counts?.unassigned ?? null },
        { id: "ai", label: "AI-Assisted", icon: Bot, badge: counts?.ai ?? null },
        { id: "escalated", label: "Escalations", icon: AlertTriangle, badge: counts?.escalated ?? null },
        { id: "resolved", label: "Resolved", icon: CheckCircle2, badge: counts?.resolved ?? null },
      ],
    },
    isSupervisor
      ? {
          label: "Manage",
          items: [
            { id: "staff", label: "Support Staff", icon: Users },
            { id: "analytics", label: "Analytics", icon: BarChart3 },
            { id: "kb", label: "Knowledge Base", icon: BookOpen },
            { id: "settings", label: "Settings", icon: Settings2 },
          ],
        }
      : { label: "Resources", items: [{ id: "kb", label: "Knowledge Base", icon: BookOpen }] },
  ];

  const roleLabel = user?.role === "admin" ? "Administrator" : me?.supportRole === "supervisor" ? "Support supervisor" : "Support representative";

  return (
    <SidebarProvider className="h-screen w-full overflow-hidden text-[#1a1917] bg-[#f8f8f8]">
      <PortalSidebar
        portalLabel={isSupervisor ? "Support Hub · Supervisor" : "Support Hub"}
        active={effectiveSection}
        onSelect={(id) => select(id as HubSection)}
        user={{ name: me?.name || user?.name, email: me?.email || user?.email, image: user?.image, roleLabel }}
        onSignOut={handleLogout}
        onOpenSettings={() => openSettings()}
        groups={groups}
      />

      <div className="flex-1 flex flex-col min-w-0 min-h-0 h-screen">
        <HubHeader
          user={user}
          me={me}
          connected={connected}
          leading={<SidebarTrigger className="size-11 shrink-0 rounded-xl" aria-label="Toggle navigation" />}
          onChangeAvailability={changeAvailability}
          availabilityBusy={availabilityBusy}
          notifications={notifications}
          onOpenNotification={onOpenNotification}
          onMarkAllRead={() => setNotifications((l) => l.map((n) => ({ ...n, read: true })))}
          onClearNotifications={() => setNotifications([])}
          onOpenSettings={() => openSettings()}
        />
        <main key={section} className="portal-page-enter portal-full flex-1 min-h-0 overflow-hidden" id="support-hub-main">
          {content}
        </main>
      </div>
    </SidebarProvider>
  );
}
