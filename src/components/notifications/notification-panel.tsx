"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { CheckCheck, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { config } from "@/lib/config";
import type { Notification } from "@/lib/types";

function timeAgo(dateStr: string): string {
  const now = new Date();
  const then = new Date(dateStr);
  const seconds = Math.floor((now.getTime() - then.getTime()) / 1000);

  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

interface NotificationPanelProps {
  onClose: () => void;
  onCountChange: (count: number) => void;
}

export function NotificationPanel({ onClose, onCountChange }: NotificationPanelProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = useCallback(() => {
    fetch(`${config.apiBaseUrl}/api/notifications`)
      .then((res) => res.json())
      .then((data) => {
        setNotifications(data.notifications ?? []);
        onCountChange(data.unreadCount ?? 0);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [onCountChange]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  async function markAllRead() {
    await fetch(`${config.apiBaseUrl}/api/notifications`, { method: "POST" });
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    onCountChange(0);
  }

  async function handleClick(notification: Notification) {
    if (!notification.isRead) {
      fetch(`${config.apiBaseUrl}/api/notifications/${notification.id}`, {
        method: "PATCH",
      });
      setNotifications((prev) =>
        prev.map((n) => (n.id === notification.id ? { ...n, isRead: true } : n)),
      );
      onCountChange(
        notifications.filter((n) => !n.isRead && n.id !== notification.id).length,
      );
    }
    onClose();
  }

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <h3 className="text-sm font-semibold">Notifications</h3>
        {unreadCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-auto py-1 px-2 text-xs gap-1"
            onClick={markAllRead}
          >
            <CheckCheck className="h-3.5 w-3.5" />
            Mark all read
          </Button>
        )}
      </div>

      <Separator />

      {/* Notification list */}
      <ScrollArea className="max-h-80">
        {loading ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            Loading...
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-8 text-center text-sm text-muted-foreground">
            <Bell className="h-5 w-5" />
            No notifications yet
          </div>
        ) : (
          <div className="flex flex-col">
            {notifications.map((notification) => (
              <Link
                key={notification.id}
                href={`/feed/${notification.itemId}`}
                onClick={() => handleClick(notification)}
                className="flex items-start gap-3 px-4 py-3 hover:bg-muted/50 transition-colors"
              >
                {/* Unread indicator */}
                <div className="mt-1.5 shrink-0">
                  {!notification.isRead ? (
                    <div className="h-2 w-2 rounded-full bg-primary" />
                  ) : (
                    <div className="h-2 w-2" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p
                    className={`text-sm leading-tight line-clamp-2 ${
                      notification.isRead ? "text-muted-foreground" : "font-medium"
                    }`}
                  >
                    {notification.title}
                  </p>
                  {notification.message && (
                    <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
                      {notification.message}
                    </p>
                  )}
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {timeAgo(notification.createdAt)}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
