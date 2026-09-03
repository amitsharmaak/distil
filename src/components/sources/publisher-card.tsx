"use client";

import { useState } from "react";
import { BookOpen, RefreshCw, ExternalLink } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { config } from "@/lib/config";

export interface PublisherCardData {
  id: string;
  name: string;
  homeUrl: string;
  status: { state: "connected" | "expired" | "never"; checkedAt: string };
  queueStats: { pending: number; fetched: number; failed: number };
}

interface PublisherCardProps {
  publisher: PublisherCardData;
  onStatusChange?: (next: PublisherCardData) => void;
}

const STATUS_LABEL: Record<PublisherCardData["status"]["state"], string> = {
  connected: "Connected",
  expired: "Expired",
  never: "Not connected",
};

const STATUS_CLASSES: Record<PublisherCardData["status"]["state"], string> = {
  connected:
    "border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400",
  expired:
    "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  never: "border-border bg-secondary text-muted-foreground",
};

export function PublisherCard({ publisher, onStatusChange }: PublisherCardProps) {
  const [loggingIn, setLoggingIn] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);

  const refetchStatus = async () => {
    try {
      const res = await fetch(`${config.apiBaseUrl}/api/publishers`);
      if (!res.ok) return;
      const data = (await res.json()) as { publishers: PublisherCardData[] };
      const updated = data.publishers.find((p) => p.id === publisher.id);
      if (updated && onStatusChange) onStatusChange(updated);
    } catch {
      // non-critical refresh failure
    }
  };

  const handleLogin = async () => {
    setLoggingIn(true);
    setMessage(null);
    try {
      const res = await fetch(
        `${config.apiBaseUrl}/api/publishers/${publisher.id}/login`,
        { method: "POST" },
      );
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setMessage({
          kind: "success",
          text: "Login complete. Session saved.",
        });
        await refetchStatus();
      } else {
        setMessage({
          kind: "error",
          text: data?.error ?? `Login failed (${res.status})`,
        });
      }
    } catch (err) {
      setMessage({
        kind: "error",
        text: err instanceof Error ? err.message : "Network error",
      });
    } finally {
      setLoggingIn(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setMessage(null);
    try {
      const res = await fetch(
        `${config.apiBaseUrl}/api/publishers/${publisher.id}/sync`,
        { method: "POST" },
      );
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const count = typeof data?.count === "number" ? data.count : 0;
        setMessage({
          kind: "success",
          text: `Synced ${count} ${count === 1 ? "article" : "articles"}.`,
        });
        await refetchStatus();
      } else {
        setMessage({
          kind: "error",
          text: data?.error ?? `Sync failed (${res.status})`,
        });
      }
    } catch (err) {
      setMessage({
        kind: "error",
        text: err instanceof Error ? err.message : "Network error",
      });
    } finally {
      setSyncing(false);
    }
  };

  const { pending, fetched, failed } = publisher.queueStats;
  const canSync = publisher.status.state === "connected" && !syncing;
  const connectLabel =
    publisher.status.state === "connected"
      ? "Reconnect"
      : publisher.status.state === "expired"
        ? "Reconnect"
        : "Connect";

  return (
    <Card className="gap-3 py-5">
      <CardContent className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-secondary p-2">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">{publisher.name}</h3>
              <a
                href={publisher.homeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                {publisher.homeUrl.replace(/^https?:\/\//, "")}
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
          <Badge
            variant="outline"
            className={STATUS_CLASSES[publisher.status.state]}
          >
            {STATUS_LABEL[publisher.status.state]}
          </Badge>
        </div>

        <Separator />

        <div className="text-xs text-muted-foreground">
          {pending} pending &middot; {fetched} fetched &middot; {failed} failed
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            className="h-11"
            variant={
              publisher.status.state === "connected" ? "outline" : "default"
            }
            onClick={handleLogin}
            disabled={loggingIn}
          >
            {loggingIn ? "Waiting for login\u2026" : connectLabel}
          </Button>
          <Button
            className="h-11 gap-1"
            variant="secondary"
            onClick={handleSync}
            disabled={!canSync}
          >
            <RefreshCw
              className={`h-3 w-3 ${syncing ? "animate-spin" : ""}`}
            />
            {syncing ? "Syncing\u2026" : "Sync Now"}
          </Button>
        </div>

        {message && (
          <p
            className={`text-[11px] ${
              message.kind === "success" ? "text-green-600" : "text-destructive"
            }`}
          >
            {message.text}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
