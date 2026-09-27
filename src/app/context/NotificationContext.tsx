import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { toast } from "sonner";

export interface Notification {
  id: string;
  userId: string;
  title: string;
  description: string;
  type: "announcement" | "assessment" | "report" | "system" | "message";
  priority: "low" | "medium" | "high";
  read: boolean;
  senderName: string | null;
  senderRole: string | null;
  createdAt: string;
}

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  isLoading: boolean;
  error: string | null;
  fetchNotifications: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  sendNotification: (payload: {
    title: string;
    description: string;
    type: string;
    priority?: string;
    targetRole?: string;
    targetUserId?: string;
    senderName?: string;
    senderRole?: string;
  }) => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotifications must be used within a NotificationProvider");
  }
  return context;
};

interface NotificationProviderProps {
  children: React.ReactNode;
  userId: string;
  userRole: string;
}

export const NotificationProvider: React.FC<NotificationProviderProps> = ({
  children,
  userId,
  userRole
}) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchNotifications = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await fetch("/api/notifications", {
        headers: {
          "x-user-id": userId,
          "x-user-role": userRole
        }
      });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.data || []);
        setError(null);
      } else {
        setError("Failed to sync notifications");
      }
    } catch (err) {
      setError("Network connection lost");
    }
  }, [userId, userRole]);

  useEffect(() => {
    if (!userId) return;
    setIsLoading(true);
    fetchNotifications().finally(() => setIsLoading(false));
    
    // Setup API polling fallback (every 5 seconds)
    const interval = setInterval(fetchNotifications, 5000);
    return () => clearInterval(interval);
  }, [fetchNotifications, userId]);

  const markAsRead = async (id: string) => {
    // Optimistic Update
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );

    try {
      const res = await fetch(`/api/notifications/${id}/read`, {
        method: "POST",
        headers: {
          "x-user-id": userId,
          "x-user-role": userRole
        }
      });
      if (!res.ok) {
        // Rollback
        fetchNotifications();
        toast.error("Failed to mark notification as read");
      }
    } catch {
      fetchNotifications();
      toast.error("Network error");
    }
  };

  const markAllAsRead = async () => {
    // Optimistic Update
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));

    try {
      const res = await fetch("/api/notifications/mark-read", {
        method: "POST",
        headers: {
          "x-user-id": userId,
          "x-user-role": userRole
        }
      });
      if (!res.ok) {
        fetchNotifications();
        toast.error("Failed to mark all as read");
      } else {
        toast.success("All notifications marked as read");
      }
    } catch {
      fetchNotifications();
      toast.error("Network error");
    }
  };

  const deleteNotification = async (id: string) => {
    // Optimistic Update
    setNotifications((prev) => prev.filter((n) => n.id !== id));

    try {
      const res = await fetch(`/api/notifications/${id}`, {
        method: "DELETE",
        headers: {
          "x-user-id": userId,
          "x-user-role": userRole
        }
      });
      if (!res.ok) {
        fetchNotifications();
        toast.error("Failed to delete notification");
      } else {
        toast.success("Notification deleted");
      }
    } catch {
      fetchNotifications();
      toast.error("Network error");
    }
  };

  const sendNotification = async (payload: any) => {
    try {
      const res = await fetch("/api/notifications", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": userId,
          "x-user-role": userRole
        },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        fetchNotifications();
      } else {
        toast.error("Failed to send notification update");
      }
    } catch {
      toast.error("Network error sending notification");
    }
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        isLoading,
        error,
        fetchNotifications,
        markAsRead,
        markAllAsRead,
        deleteNotification,
        sendNotification
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};
