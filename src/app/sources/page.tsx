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
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

interface SlackStatusResponse {
  connected: boolean;
  teamName: string | null;
}

// ── Source icon map ────────────────────────────────────────────────────────────

const sourceIcons: Record<string, React.ElementType> = {
  Mail,
  Hash,
  Globe,
  Link: LinkIcon,
};

// ── Available integrations list ────────────────────────────────────────────────

const availableIntegrations: {
  type: SourceType;
  name: string;
  description: string;
  icon: string;
}[] = [
  {
    type: "gmail",
    name: "Gmail",
    description: "Connect your Gmail to import newsletters and shared links",
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

// ── Helper ─────────────────────────────────────────────────────────────────────

/** Returns a human-readable relative time string. */
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

// ── Main component ─────────────────────────────────────────────────────────────

export default function SourcesPage() {
  // ── State ───────────────────────────────────────────────────────────────────

  const [linkInput, setLinkInput] = useState("");
  /** URLs that have been successfully saved to the API this session. */
  const [savedLinks, setSavedLinks] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [saving, setSaving] = useState(false);

  // Gmail connection state
  const [gmailStatus, setGmailStatus] = useState<GmailStatusResponse | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ count: number } | null>(null);

  // Slack connection state
  const [slackStatus, setSlackStatus] = useState<SlackStatusResponse | null>(null);
  const [slackSyncing, setSlackSyncing] = useState(false);
  const [slackSyncResult, setSlackSyncResult] = useState<{
    count: number;
    unresolvedChannels?: string[];
  } | null>(null);

  // Per-source item counts from the API
  const [sourceCounts, setSourceCounts] = useState<Record<string, number>>({});

  // True once both Gmail and Slack status fetches have settled (success or error).
  const [statusesLoaded, setStatusesLoaded] = useState(false);

  // ── Gmail status fetch ──────────────────────────────────────────────────────

  const fetchGmailStatus = useCallback(async () => {
    try {
      const res = await fetch(`${config.apiBaseUrl}/api/auth/gmail/status`);
      if (res.ok) setGmailStatus(await res.json());
    } catch (err) {
      console.error("Failed to fetch Gmail status:", err);
    }
  }, []);

  // ── Slack status fetch ──────────────────────────────────────────────────────

  const fetchSlackStatus = useCallback(async () => {
    try {
      const res = await fetch(`${config.apiBaseUrl}/api/slack/status`);
      if (res.ok) setSlackStatus(await res.json());
    } catch (err) {
      console.error("Failed to fetch Slack status:", err);
    }
  }, []);

  // Fetch Gmail status, Slack status, and source counts together.
  // All three must resolve before any cards render (no staggered pop-in).
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

    Promise.all([fetchGmailStatus(), fetchSlackStatus(), fetchSourceCounts()]).then(() =>
      setStatusesLoaded(true),
    );
  }, [fetchGmailStatus, fetchSlackStatus]);

  // After OAuth redirect, re-fetch status and clean up the URL query param.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("connected") === "gmail") {
      fetchGmailStatus();
      window.history.replaceState({}, "", "/sources");
    }
  }, [fetchGmailStatus]);

  // ── Gmail sync ──────────────────────────────────────────────────────────────

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
        // Re-fetch status so lastSync timestamp updates.
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

  // ── Slack sync ──────────────────────────────────────────────────────────────

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

  // ── Link saving ─────────────────────────────────────────────────────────────

  /**
   * Sends a URL to the API as a manual link.
   * On success, adds the URL to the recently-saved list.
   */
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

  /** Handles the Add button click and Enter key in the input. */
  const addLink = async () => {
    if (!linkInput.trim()) return;
    await saveUrl(linkInput);
    setLinkInput("");
  };

  /** Handles URLs dropped onto the drop zone. */
  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const text = e.dataTransfer.getData("text/plain");
    if (text && text.startsWith("http")) {
      await saveUrl(text);
    }
  }, []);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Page header + Add Source button */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Sources</h1>
          <p className="text-muted-foreground">Manage your connected information sources</p>
        </div>

        {/* Add Source dialog */}
        <Dialog>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" /> Add Source
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Add a new source</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 pt-2">
              {availableIntegrations.map((integration) => {
                const IconComponent = sourceIcons[integration.icon];

                // Gmail: use real OAuth status instead of mock data.
                if (integration.type === "gmail") {
                  return (
                    <div
                      key={integration.type}
                      className="flex items-center gap-3 rounded-lg border border-border p-3"
                    >
                      <IconComponent className="h-5 w-5 text-muted-foreground" />
                      <div className="flex-1">
                        <p className="text-sm font-medium">{integration.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {gmailStatus?.connected
                            ? gmailStatus.email ?? "Connected"
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
                            <RefreshCw className={`h-3 w-3 ${syncing ? "animate-spin" : ""}`} />
                            {syncing ? "Syncing…" : "Sync Now"}
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

                // Slack: use real connection status.
                if (integration.type === "slack") {
                  return (
                    <div
                      key={integration.type}
                      className="flex items-center gap-3 rounded-lg border border-border p-3"
                    >
                      <IconComponent className="h-5 w-5 text-muted-foreground" />
                      <div className="flex-1">
                        <p className="text-sm font-medium">{integration.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {slackStatus?.connected
                            ? slackStatus.teamName ?? "Connected"
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
                            {slackSyncing ? "Syncing…" : "Sync Now"}
                          </Button>
                          {slackSyncResult !== null && (
                            <span className="text-[10px] text-green-600">
                              {slackSyncResult.count} new items
                            </span>
                          )}
                          {slackSyncResult?.unresolvedChannels?.length ? (
                            <span className="text-[10px] text-amber-600">
                              Channel{slackSyncResult.unresolvedChannels.length > 1 ? "s" : ""} not
                              found: {slackSyncResult.unresolvedChannels.join(", ")}
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

                // All other integrations: not yet implemented.
                return (
                  <div
                    key={integration.type}
                    className="flex items-center gap-3 rounded-lg border border-border p-3"
                  >
                    <IconComponent className="h-5 w-5 text-muted-foreground" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">{integration.name}</p>
                      <p className="text-xs text-muted-foreground">{integration.description}</p>
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
        <div className="py-8 text-center text-muted-foreground">Loading sources…</div>
      )}
      <div className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-3${statusesLoaded ? "" : " hidden"}`}>
        {/* Gmail card — uses real connection status */}
        {gmailStatus !== null && (
          <Card>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-muted p-2">
                    <Mail className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm">Gmail</h3>
                    <div className="flex items-center gap-1 mt-0.5">
                      {gmailStatus.connected ? (
                        <CheckCircle2 className="h-3 w-3 text-green-500" />
                      ) : (
                        <XCircle className="h-3 w-3 text-red-500" />
                      )}
                      <span className="text-xs text-muted-foreground">
                        {gmailStatus.connected
                          ? gmailStatus.email ?? "Connected"
                          : "Not connected"}
                      </span>
                    </div>
                  </div>
                </div>
                {gmailStatus.connected && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={syncGmail}
                    disabled={syncing}
                    className="h-7 px-2"
                  >
                    <RefreshCw className={`h-3 w-3 ${syncing ? "animate-spin" : ""}`} />
                  </Button>
                )}
              </div>
              <Separator className="my-3" />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                {gmailStatus.connected ? (
                  <>
                    {syncResult !== null && (
                      <span className="text-green-600">{syncResult.count} new items synced</span>
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
            </CardContent>
          </Card>
        )}

        {/* Slack card — uses real connection status */}
        {slackStatus !== null && (
          <Card>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-muted p-2">
                    <Hash className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm">Slack</h3>
                    <div className="flex items-center gap-1 mt-0.5">
                      {slackStatus.connected ? (
                        <CheckCircle2 className="h-3 w-3 text-green-500" />
                      ) : (
                        <XCircle className="h-3 w-3 text-red-500" />
                      )}
                      <span className="text-xs text-muted-foreground">
                        {slackStatus.connected
                          ? slackStatus.teamName ?? "Connected"
                          : "Not configured"}
                      </span>
                    </div>
                  </div>
                </div>
                {slackStatus.connected && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={syncSlack}
                    disabled={slackSyncing}
                    className="h-7 px-2"
                  >
                    <RefreshCw className={`h-3 w-3 ${slackSyncing ? "animate-spin" : ""}`} />
                  </Button>
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
                        {slackSyncResult.unresolvedChannels.join(", ")} not found — use channel IDs
                        or add groups:read scope
                      </span>
                    ) : null}
                    {slackSyncResult === null && <span>Channels &amp; threads</span>}
                  </>
                ) : (
                  <span>Add SLACK_BOT_TOKEN to .env.local</span>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Dynamic cards for other active sources */}
        {Object.entries(sourceCounts)
          .filter(([type]) => type !== "gmail" && type !== "slack")
          .map(([type, count]) => {
            const meta = availableIntegrations.find((i) => i.type === type);
            const IconComponent = sourceIcons[meta?.icon ?? "Link"] ?? LinkIcon;
            const label =
              meta?.name ?? (type === "browser-extension" ? "Browser Extension" : type === "manual" ? "Manual Links" : type);
            return (
              <Card key={type}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="rounded-lg bg-muted p-2">
                        <IconComponent className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-sm">{label}</h3>
                        <div className="flex items-center gap-1 mt-0.5">
                          <CheckCircle2 className="h-3 w-3 text-green-500" />
                          <span className="text-xs text-muted-foreground">Active</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <Separator className="my-3" />
                  <div className="text-xs text-muted-foreground">
                    {count} {count === 1 ? "item" : "items"} saved
                  </div>
                </CardContent>
              </Card>
            );
          })}
      </div>

      {/* Quick Add Links — fully wired to POST /api/items */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Upload className="h-4 w-4" />
            Quick Add Links
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* URL input + Add button */}
          <div className="flex gap-2">
            <Input
              placeholder="Paste a URL here..."
              value={linkInput}
              onChange={(e) => setLinkInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addLink()}
            />
            <Button onClick={addLink} disabled={saving || !linkInput.trim()}>
              {saving ? "Saving…" : "Add"}
            </Button>
          </div>

          {/* Drag & drop zone */}
          <div
            className={`rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
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
            <p className="mt-2 text-sm text-muted-foreground">Drag & drop links here</p>
            <p className="text-xs text-muted-foreground">
              The agent will process and categorize them automatically
            </p>
          </div>

          {/* Recently saved links — shown after successful API calls */}
          {savedLinks.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Recently saved:</p>
              {savedLinks.map((link, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg bg-muted p-2 text-sm">
                  <LinkIcon className="h-3 w-3 shrink-0" />
                  <span className="truncate">{link}</span>
                  <Badge variant="secondary" className="text-[10px] shrink-0">
                    Saved
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
