"use client";

/**
 * Sources page — manage connected information sources and manually add links.
 *
 * Gmail and Slack cards are wired to real OAuth + sync endpoints.
 * The "Quick Add Links" section is fully wired to the POST /api/items endpoint.
 */

import { useState, useCallback, useEffect } from "react";
import {
  Mail,
  Hash,
  Globe,
  Link as LinkIcon,
  Plus,
  CheckCircle2,
  XCircle,
  Upload,
  Clock,
  RefreshCw,
  BookOpen,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import type { SourceType } from "@/lib/types";
import { config } from "@/lib/config";
import type { GmailStatusResponse } from "@/app/api/auth/gmail/status/route";
import {
  PublisherCard,
  type PublisherCardData,
} from "@/components/sources/publisher-card";

interface SlackStatusResponse {
  connected: boolean;
  teamName: string | null;
}

const sourceIcons: Record<string, React.ElementType> = {
  Mail,
  Hash,
  Globe,
  Link: LinkIcon,
  BookOpen,
};

const availableIntegrations: {
  type: SourceType;
  name: string;
  description: string;
  icon: string;
}[] = [
  {
    type: "gmail",
    name: "Gmail",
    description:
      "Connect Gmail to import newsletter-style mail (auto-detected from your inbox)",
    icon: "Mail",
  },
  {
    type: "slack",
    name: "Slack",
    description: "Monitor channels for shared articles and discussions",
    icon: "Hash",
  },
  {
    type: "browser-extension",
    name: "Browser Extension",
    description: "Save any webpage with one click using the Distil extension",
    icon: "Globe",
  },
];

// Sync interval from env (falls back to 3h default). Exposed via NEXT_PUBLIC_
// so it's available in the client bundle for display purposes.
const SYNC_INTERVAL_HOURS = parseInt(
  process.env.NEXT_PUBLIC_SYNC_INTERVAL_HOURS ?? "3",
  10,
);

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export default function SourcesPage() {
  const [linkInput, setLinkInput] = useState("");
  const [savedLinks, setSavedLinks] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [saving, setSaving] = useState(false);

  const [gmailStatus, setGmailStatus] = useState<GmailStatusResponse | null>(
    null,
  );
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ count: number } | null>(null);

  const [slackStatus, setSlackStatus] = useState<SlackStatusResponse | null>(
    null,
  );
  const [slackSyncing, setSlackSyncing] = useState(false);
  const [slackSyncResult, setSlackSyncResult] = useState<{
    count: number;
    unresolvedChannels?: string[];
  } | null>(null);

  const [disconnecting, setDisconnecting] = useState(false);
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);

  const [sourceCounts, setSourceCounts] = useState<Record<string, number>>({});
  const [statusesLoaded, setStatusesLoaded] = useState(false);

  const [publishers, setPublishers] = useState<PublisherCardData[]>([]);

  const fetchPublishers = useCallback(async () => {
    try {
      const res = await fetch(`${config.apiBaseUrl}/api/publishers`);
      if (res.ok) {
        const data = (await res.json()) as { publishers: PublisherCardData[] };
        setPublishers(data.publishers ?? []);
      }
    } catch (err) {
      console.error("Failed to fetch publishers:", err);
    }
  }, []);

  const fetchGmailStatus = useCallback(async () => {
    try {
      const res = await fetch(`${config.apiBaseUrl}/api/auth/gmail/status`);
      if (res.ok) setGmailStatus(await res.json());
    } catch (err) {
      console.error("Failed to fetch Gmail status:", err);
    }
  }, []);

  const fetchSlackStatus = useCallback(async () => {
    try {
      const res = await fetch(`${config.apiBaseUrl}/api/slack/status`);
      if (res.ok) setSlackStatus(await res.json());
    } catch (err) {
      console.error("Failed to fetch Slack status:", err);
    }
  }, []);

  useEffect(() => {
    const fetchSourceCounts = async () => {
      try {
        const res = await fetch(`${config.apiBaseUrl}/api/items`);
        if (res.ok) {
          const data = await res.json();
          const counts: Record<string, number> = {};
          for (const item of data.items ?? []) {
            counts[item.sourceType] = (counts[item.sourceType] ?? 0) + 1;
          }
          setSourceCounts(counts);
        }
      } catch {
        // non-critical
      }
    };

    Promise.all([
      fetchGmailStatus(),
      fetchSlackStatus(),
      fetchSourceCounts(),
      fetchPublishers(),
    ]).then(() => setStatusesLoaded(true));
  }, [fetchGmailStatus, fetchSlackStatus, fetchPublishers]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("connected") === "gmail") {
      fetchGmailStatus();
      window.history.replaceState({}, "", "/sources");
    }
  }, [fetchGmailStatus]);

  const syncGmail = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch(`${config.apiBaseUrl}/api/gmail/sync`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok) {
        setSyncResult({ count: data.count });
        await fetchGmailStatus();
      } else {
        console.error("Gmail sync failed:", data.error);
      }
    } catch (err) {
      console.error("Network error during Gmail sync:", err);
    } finally {
      setSyncing(false);
    }
  };

  const disconnectGmailHandler = async () => {
    setDisconnecting(true);
    try {
      const res = await fetch(`${config.apiBaseUrl}/api/auth/gmail`, {
        method: "DELETE",
      });
      if (res.ok) {
        setGmailStatus({ connected: false, email: null, lastSync: null });
        setSyncResult(null);
        setShowDisconnectConfirm(false);
      } else {
        console.error("Failed to disconnect Gmail");
      }
    } catch (err) {
      console.error("Network error disconnecting Gmail:", err);
    } finally {
      setDisconnecting(false);
    }
  };

  const syncSlack = async () => {
    setSlackSyncing(true);
    setSlackSyncResult(null);
    try {
      const res = await fetch(`${config.apiBaseUrl}/api/slack/sync`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok) {
        setSlackSyncResult({
          count: data.count,
          unresolvedChannels: data.unresolvedChannels,
        });
        await fetchSlackStatus();
      } else {
        console.error("Slack sync failed:", data.error);
      }
    } catch (err) {
      console.error("Network error during Slack sync:", err);
    } finally {
      setSlackSyncing(false);
    }
  };

  const saveUrl = async (url: string) => {
    const trimmed = url.trim();
    if (!trimmed) return;

    setSaving(true);
    try {
      const res = await fetch(`${config.apiBaseUrl}/api/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: trimmed,
          sourceType: "manual",
          contentType: "article",
          priority: "medium",
          topics: [],
        }),
      });

      if (res.ok) {
        setSavedLinks((prev) => [trimmed, ...prev]);
      } else {
        console.error("Failed to save link:", await res.text());
      }
    } catch (err) {
      console.error("Network error saving link:", err);
    } finally {
      setSaving(false);
    }
  };

  const addLink = async () => {
    if (!linkInput.trim()) return;
    await saveUrl(linkInput);
    setLinkInput("");
  };

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const text = e.dataTransfer.getData("text/plain");
    if (text && text.startsWith("http")) {
      await saveUrl(text);
    }
  }, []);

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl font-semibold tracking-tight">
            Sources
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your connected information sources
          </p>
        </div>

        <Dialog>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Add Source
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Add a new source</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 pt-2">
              {availableIntegrations.map((integration) => {
                const IconComponent = sourceIcons[integration.icon];

                if (integration.type === "gmail") {
                  return (
                    <div
                      key={integration.type}
                      className="flex items-center gap-3 rounded-xl border border-border p-3"
                    >
                      <IconComponent className="h-5 w-5 text-muted-foreground" />
                      <div className="flex-1">
                        <p className="text-sm font-medium">
                          {integration.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {gmailStatus?.connected
                            ? (gmailStatus.email ?? "Connected")
                            : integration.description}
                        </p>
                      </div>
                      {gmailStatus?.connected ? (
                        <div className="flex flex-col items-end gap-1">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={syncGmail}
                            disabled={syncing}
                            className="gap-1"
                          >
                            <RefreshCw
                              className={`h-3 w-3 ${syncing ? "animate-spin" : ""}`}
                            />
                            {syncing ? "Syncing\u2026" : "Sync Now"}
                          </Button>
                          {syncResult !== null && (
                            <span className="text-[10px] text-green-600">
                              {syncResult.count} new items
                            </span>
                          )}
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => {
                            window.location.href = "/api/auth/gmail";
                          }}
                        >
                          Connect
                        </Button>
                      )}
                    </div>
                  );
                }

                if (integration.type === "slack") {
                  return (
                    <div
                      key={integration.type}
                      className="flex items-center gap-3 rounded-xl border border-border p-3"
                    >
                      <IconComponent className="h-5 w-5 text-muted-foreground" />
                      <div className="flex-1">
                        <p className="text-sm font-medium">
                          {integration.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {slackStatus?.connected
                            ? (slackStatus.teamName ?? "Connected")
                            : integration.description}
                        </p>
                      </div>
                      {slackStatus?.connected ? (
                        <div className="flex flex-col items-end gap-1">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={syncSlack}
                            disabled={slackSyncing}
                            className="gap-1"
                          >
                            <RefreshCw
                              className={`h-3 w-3 ${slackSyncing ? "animate-spin" : ""}`}
                            />
                            {slackSyncing ? "Syncing\u2026" : "Sync Now"}
                          </Button>
                          {slackSyncResult !== null && (
                            <span className="text-[10px] text-green-600">
                              {slackSyncResult.count} new items
                            </span>
                          )}
                          {slackSyncResult?.unresolvedChannels?.length ? (
                            <span className="text-[10px] text-amber-600">
                              Channel
                              {slackSyncResult.unresolvedChannels.length > 1
                                ? "s"
                                : ""}{" "}
                              not found:{" "}
                              {slackSyncResult.unresolvedChannels.join(", ")}
                            </span>
                          ) : null}
                        </div>
                      ) : (
                        <div className="flex flex-col items-end gap-1">
                          <Button size="sm" disabled>
                            Connect
                          </Button>
                          <span className="text-[10px] text-muted-foreground">
                            Add SLACK_BOT_TOKEN to .env.local
                          </span>
                        </div>
                      )}
                    </div>
                  );
                }

                return (
                  <div
                    key={integration.type}
                    className="flex items-center gap-3 rounded-xl border border-border p-3"
                  >
                    <IconComponent className="h-5 w-5 text-muted-foreground" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">{integration.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {integration.description}
                      </p>
                    </div>
                    <Button size="sm" disabled>
                      Coming Soon
                    </Button>
                  </div>
                );
              })}
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Connected source cards */}
      {!statusesLoaded && (
        <div className="py-8 text-center text-sm text-muted-foreground">
          Loading sources&hellip;
        </div>
      )}
      <div
        className={`grid gap-3 sm:grid-cols-2 lg:grid-cols-3${statusesLoaded ? "" : " hidden"}`}
      >
        {/* Gmail card */}
        {gmailStatus !== null && (
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-secondary p-2">
                  <Mail className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold">Gmail</h3>
                  <div className="mt-0.5 flex items-center gap-1">
                    {gmailStatus.connected ? (
                      <CheckCircle2 className="h-3 w-3 text-green-500" />
                    ) : (
                      <XCircle className="h-3 w-3 text-red-500" />
                    )}
                    <span className="text-xs text-muted-foreground">
                      {gmailStatus.connected
                        ? (gmailStatus.email ?? "Connected")
                        : "Not connected"}
                    </span>
                  </div>
                </div>
              </div>
              {gmailStatus.connected && (
                <div className="flex items-center gap-1">
                  {SYNC_INTERVAL_HOURS > 0 && (
                    <span className="text-[10px] text-muted-foreground">
                      every {SYNC_INTERVAL_HOURS}h
                    </span>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={syncGmail}
                    disabled={syncing}
                    className="h-7 px-2"
                    title="Sync now"
                  >
                    <RefreshCw
                      className={`h-3 w-3 ${syncing ? "animate-spin" : ""}`}
                    />
                  </Button>
                </div>
              )}
            </div>
            <Separator className="my-3" />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              {gmailStatus.connected ? (
                <>
                  {syncResult !== null && (
                    <span className="text-green-600">
                      {syncResult.count} new items synced
                    </span>
                  )}
                  {syncResult === null && <span>Newsletters &amp; digests</span>}
                  {gmailStatus.lastSync && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {timeAgo(gmailStatus.lastSync)}
                    </span>
                  )}
                </>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    window.location.href = "/api/auth/gmail";
                  }}
                >
                  Connect Gmail
                </Button>
              )}
            </div>
            {gmailStatus.connected && (
              <div className="mt-3">
                {showDisconnectConfirm ? (
                  <div className="flex items-center justify-between rounded-lg bg-destructive/10 p-2">
                    <span className="text-xs text-destructive">
                      Disconnect Gmail?
                    </span>
                    <div className="flex gap-1.5">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-xs"
                        onClick={() => setShowDisconnectConfirm(false)}
                        disabled={disconnecting}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="h-6 px-2 text-xs"
                        onClick={disconnectGmailHandler}
                        disabled={disconnecting}
                      >
                        {disconnecting ? "Disconnecting\u2026" : "Confirm"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-full text-xs text-muted-foreground hover:text-destructive"
                    onClick={() => setShowDisconnectConfirm(true)}
                  >
                    Disconnect
                  </Button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Slack card */}
        {slackStatus !== null && (
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-secondary p-2">
                  <Hash className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold">Slack</h3>
                  <div className="mt-0.5 flex items-center gap-1">
                    {slackStatus.connected ? (
                      <CheckCircle2 className="h-3 w-3 text-green-500" />
                    ) : (
                      <XCircle className="h-3 w-3 text-red-500" />
                    )}
                    <span className="text-xs text-muted-foreground">
                      {slackStatus.connected
                        ? (slackStatus.teamName ?? "Connected")
                        : "Not configured"}
                    </span>
                  </div>
                </div>
              </div>
              {slackStatus.connected && (
                <div className="flex items-center gap-1">
                  {SYNC_INTERVAL_HOURS > 0 && (
                    <span className="text-[10px] text-muted-foreground">
                      every {SYNC_INTERVAL_HOURS}h
                    </span>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={syncSlack}
                    disabled={slackSyncing}
                    className="h-7 px-2"
                    title="Sync now"
                  >
                    <RefreshCw
                      className={`h-3 w-3 ${slackSyncing ? "animate-spin" : ""}`}
                    />
                  </Button>
                </div>
              )}
            </div>
            <Separator className="my-3" />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              {slackStatus.connected ? (
                <>
                  {slackSyncResult !== null && (
                    <span className="text-green-600">
                      {slackSyncResult.count} new items synced
                    </span>
                  )}
                  {slackSyncResult?.unresolvedChannels?.length ? (
                    <span className="text-amber-600">
                      {slackSyncResult.unresolvedChannels.join(", ")} not found
                      &mdash; use channel IDs or add groups:read scope
                    </span>
                  ) : null}
                  {slackSyncResult === null && (
                    <span>Channels &amp; threads</span>
                  )}
                </>
              ) : (
                <span>Add SLACK_BOT_TOKEN to .env.local</span>
              )}
            </div>
          </div>
        )}

        {/* Dynamic cards for other active sources */}
        {Object.entries(sourceCounts)
          .filter(([type]) => type !== "gmail" && type !== "slack")
          .map(([type, count]) => {
            const meta = availableIntegrations.find((i) => i.type === type);
            const IconComponent =
              sourceIcons[meta?.icon ?? "Link"] ?? LinkIcon;
            const label =
              meta?.name ??
              (type === "browser-extension"
                ? "Browser Extension"
                : type === "manual"
                  ? "Manual Links"
                  : type);
            return (
              <div
                key={type}
                className="rounded-xl border border-border bg-card p-5"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-secondary p-2">
                      <IconComponent className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold">{label}</h3>
                      <div className="mt-0.5 flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3 text-green-500" />
                        <span className="text-xs text-muted-foreground">
                          Active
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                <Separator className="my-3" />
                <div className="text-xs text-muted-foreground">
                  {count} {count === 1 ? "item" : "items"} saved
                </div>
              </div>
            );
          })}
      </div>

      {/* Publications */}
      {publishers.length > 0 && (
        <section>
          <div className="distil-section-label mb-4 flex items-center gap-2">
            <BookOpen className="h-3.5 w-3.5" />
            Publications
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {publishers.map((p) => (
              <PublisherCard
                key={p.id}
                publisher={p}
                onStatusChange={(updated) =>
                  setPublishers((prev) =>
                    prev.map((existing) =>
                      existing.id === updated.id ? updated : existing,
                    ),
                  )
                }
              />
            ))}
          </div>
        </section>
      )}

      {/* Quick Add Links */}
      <section>
        <div className="distil-section-label mb-4 flex items-center gap-2">
          <Upload className="h-3.5 w-3.5" />
          Quick Add Links
        </div>
        <div className="space-y-4 rounded-xl border border-border bg-card p-5">
          <div className="flex gap-2">
            <Input
              placeholder="Paste a URL here..."
              value={linkInput}
              onChange={(e) => setLinkInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addLink()}
              className="h-9"
            />
            <Button
              size="sm"
              onClick={addLink}
              disabled={saving || !linkInput.trim()}
            >
              {saving ? "Saving\u2026" : "Add"}
            </Button>
          </div>

          <div
            className={`rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
              isDragging ? "border-primary bg-primary/5" : "border-border"
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            <Upload className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">
              Drag &amp; drop links here
            </p>
            <p className="text-xs text-muted-foreground">
              The agent will process and categorize them automatically
            </p>
          </div>

          {savedLinks.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                Recently saved:
              </p>
              {savedLinks.map((link, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 rounded-lg bg-secondary p-2 text-sm"
                >
                  <LinkIcon className="h-3 w-3 shrink-0" />
                  <span className="truncate">{link}</span>
                  <Badge variant="secondary" className="shrink-0 text-[10px]">
                    Saved
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
