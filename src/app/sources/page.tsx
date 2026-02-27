"use client";

/**
 * Sources page — manage connected information sources and manually add links.
 *
 * The source card grid uses mockSources for display (no DB table for Sources yet —
 * that's a future phase). The "Quick Add Links" section is fully wired to the
 * POST /api/items endpoint so manually pasted or dragged URLs are saved for real.
 */

import { useState, useCallback } from "react";
import {
  Mail,
  Hash,
  MessageCircle,
  Twitter,
  Linkedin,
  Globe,
  Link as LinkIcon,
  Plus,
  CheckCircle2,
  XCircle,
  Upload,
  Clock,
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
// mockSources used for source card display only — no real Source DB table yet.
import { mockSources } from "@/lib/mock-data";
import type { SourceType } from "@/lib/types";
import { config } from "@/lib/config";

// ── Source icon map ────────────────────────────────────────────────────────────

const sourceIcons: Record<string, React.ElementType> = {
  Mail,
  Hash,
  MessageCircle,
  Twitter,
  Linkedin,
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
    type: "whatsapp",
    name: "WhatsApp",
    description: "Import links shared in your WhatsApp groups and chats",
    icon: "MessageCircle",
  },
  {
    type: "twitter",
    name: "Twitter / X",
    description: "Follow topics and threads from your Twitter feed",
    icon: "Twitter",
  },
  {
    type: "linkedin",
    name: "LinkedIn",
    description: "Track posts and articles from your LinkedIn network",
    icon: "Linkedin",
  },
  {
    type: "browser-extension",
    name: "Browser Extension",
    description: "Save any webpage with one click using the PIA extension",
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

  // ── Link saving ─────────────────────────────────────────────────────────────

  /**
   * Sends a URL to the API as a manual link.
   * On success, adds the URL to the recently-saved list.
   * On failure, logs the error — a toast/error state can be added later.
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
        // Show the URL in the recently-saved list so the user gets feedback.
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

        {/* Add Source dialog — Connect buttons are future-phase */}
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
                const isConnected = mockSources.some(
                  (s) => s.type === integration.type && s.isConnected
                );
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
                    <Button
                      size="sm"
                      variant={isConnected ? "secondary" : "default"}
                      disabled={isConnected}
                    >
                      {isConnected ? "Connected" : "Connect"}
                    </Button>
                  </div>
                );
              })}
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Connected source cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {mockSources.map((source) => {
          const IconComponent = sourceIcons[source.icon];
          return (
            <Card key={source.id}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-muted p-2">
                      <IconComponent className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm">{source.name}</h3>
                      <div className="flex items-center gap-1 mt-0.5">
                        {source.isConnected ? (
                          <CheckCircle2 className="h-3 w-3 text-green-500" />
                        ) : (
                          <XCircle className="h-3 w-3 text-red-500" />
                        )}
                        <span className="text-xs text-muted-foreground">
                          {source.isConnected ? "Connected" : "Disconnected"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                <Separator className="my-3" />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{source.itemCount} items</span>
                  {source.lastSynced && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {timeAgo(source.lastSynced)}
                    </span>
                  )}
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
