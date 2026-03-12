"use client";

import { useState, useEffect, useRef } from "react";
import {
  Mail,
  Hash,
  MessageCircle,
  Globe,
  Link as LinkIcon,
  Shield,
  Bot,
  Bell,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { config } from "@/lib/config";
import type { ContentItem } from "@/lib/types";

const sourceIcons: Record<string, React.ElementType> = {
  Mail,
  Hash,
  MessageCircle,
  Globe,
  Link: LinkIcon,
};

interface DerivedSource {
  type: string;
  name: string;
  icon: string;
  itemCount: number;
}

interface DerivedTopic {
  name: string;
  itemCount: number;
  color: string;
}

const EMAIL_CATEGORIES: { id: string; label: string; description: string }[] = [
  { id: "newsletter", label: "Newsletter", description: "Subscriptions and curated content from publishers" },
  { id: "digest", label: "Digest", description: "Periodic summaries (e.g. daily or weekly digests)" },
  { id: "announcement", label: "Announcement", description: "Product updates and company announcements" },
  { id: "notification", label: "Notification", description: "Alerts, confirmations, and system messages" },
  { id: "personal", label: "Personal", description: "Direct messages from people" },
  { id: "transactional", label: "Transactional", description: "Receipts, shipping updates, and account notifications" },
  { id: "promotional", label: "Promotional", description: "Marketing and sales emails" },
  { id: "automated", label: "Automated", description: "System-generated reports and alerts" },
];

const SOURCE_META: Record<string, { name: string; icon: string }> = {
  gmail: { name: "Gmail", icon: "Mail" },
  slack: { name: "Slack", icon: "Hash" },
  "browser-extension": { name: "Browser Extension", icon: "Globe" },
  manual: { name: "Manual Links", icon: "Link" },
};

const TOPIC_COLORS = [
  "#4F46E5", "#0891B2", "#D97706", "#059669", "#DC2626",
  "#2563EB", "#65A30D", "#DB2777", "#7C3AED", "#EA580C",
];

export default function SettingsPage() {
  const [summaryLength, setSummaryLength] = useState<"brief" | "detailed">(
    "detailed",
  );
  const [pollingFrequency, setPollingFrequency] = useState("15");
  const [highPriorityEnabled, setHighPriorityEnabled] = useState(true);
  const [sources, setSources] = useState<DerivedSource[]>([]);
  const [topics, setTopics] = useState<DerivedTopic[]>([]);

  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deleteStatus, setDeleteStatus] = useState<
    "idle" | "confirm" | "deleting" | "done"
  >("idle");
  const passwordInputRef = useRef<HTMLInputElement>(null);

  const [allowedEmailCategories, setAllowedEmailCategories] = useState<
    string[]
  >(["newsletter", "digest", "announcement"]);

  useEffect(() => {
    fetch(`${config.apiBaseUrl}/api/notifications/preferences`)
      .then((res) => res.json())
      .then((data) => setHighPriorityEnabled(data.highPriorityItems))
      .catch(() => {});

    fetch(`${config.apiBaseUrl}/api/settings/email-intelligence`)
      .then((res) => res.json())
      .then((data) => setAllowedEmailCategories(data.allowedCategories ?? []))
      .catch(() => {});

    fetch(`${config.apiBaseUrl}/api/items`)
      .then((res) => res.json())
      .then((data: { items: ContentItem[] }) => {
        const srcMap = new Map<string, number>();
        const topicMap = new Map<string, number>();
        for (const item of data.items) {
          srcMap.set(item.sourceType, (srcMap.get(item.sourceType) || 0) + 1);
          for (const t of item.topics) {
            topicMap.set(t, (topicMap.get(t) || 0) + 1);
          }
        }
        setSources(
          Array.from(srcMap.entries()).map(([type, count]) => ({
            type,
            name: SOURCE_META[type]?.name ?? type,
            icon: SOURCE_META[type]?.icon ?? "Globe",
            itemCount: count,
          })),
        );
        setTopics(
          Array.from(topicMap.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([name, count], i) => ({
              name,
              itemCount: count,
              color: TOPIC_COLORS[i % TOPIC_COLORS.length],
            })),
        );
      })
      .catch(() => {});
  }, []);

  async function handleDeleteAllData() {
    setDeleteError("");
    setDeleteStatus("deleting");
    try {
      const res = await fetch(`${config.apiBaseUrl}/api/data`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: deletePassword }),
      });
      if (res.status === 403) {
        setDeleteError("Incorrect password.");
        setDeleteStatus("confirm");
        return;
      }
      if (!res.ok) throw new Error("Server error");
      setDeleteStatus("done");
      setDeletePassword("");
      setSources([]);
      setTopics([]);
    } catch {
      setDeleteError("Something went wrong. Please try again.");
      setDeleteStatus("confirm");
    }
  }

  async function toggleHighPriority() {
    const newVal = !highPriorityEnabled;
    setHighPriorityEnabled(newVal);
    await fetch(`${config.apiBaseUrl}/api/notifications/preferences`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ highPriorityItems: newVal }),
    });
  }

  async function toggleEmailCategory(categoryId: string) {
    const isEnabled = allowedEmailCategories.includes(categoryId);
    const newCategories = isEnabled
      ? allowedEmailCategories.filter((c) => c !== categoryId)
      : [...allowedEmailCategories, categoryId];
    setAllowedEmailCategories(newCategories);
    await fetch(`${config.apiBaseUrl}/api/settings/email-intelligence`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ allowedCategories: newCategories }),
    });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-semibold tracking-tight">
          Settings
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure your Distil preferences
        </p>
      </div>

      <Tabs defaultValue="accounts">
        <TabsList>
          <TabsTrigger value="accounts" className="gap-1.5">
            <Shield className="h-3.5 w-3.5" /> Accounts
          </TabsTrigger>
          <TabsTrigger value="agent" className="gap-1.5">
            <Bot className="h-3.5 w-3.5" /> Agent
          </TabsTrigger>
          <TabsTrigger value="topics" className="gap-1.5">
            <Hash className="h-3.5 w-3.5" /> Topics
          </TabsTrigger>
          <TabsTrigger value="notifications" className="gap-1.5">
            <Bell className="h-3.5 w-3.5" /> Notifications
          </TabsTrigger>
          <TabsTrigger value="email-intelligence" className="gap-1.5">
            <Mail className="h-3.5 w-3.5" /> Email Intelligence
          </TabsTrigger>
        </TabsList>

        {/* Accounts Tab */}
        <TabsContent value="accounts" className="mt-4 space-y-4">
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="mb-4 text-sm font-semibold">Connected Accounts</h3>
            <div className="space-y-3">
              {sources.length === 0 ? (
                <p className="py-2 text-sm text-muted-foreground">
                  No connected accounts yet. Add sources from the Sources page.
                </p>
              ) : (
                sources.map((source) => {
                  const IconComponent = sourceIcons[source.icon];
                  return (
                    <div
                      key={source.type}
                      className="flex items-center justify-between rounded-lg border border-border p-3"
                    >
                      <div className="flex items-center gap-3">
                        <IconComponent className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">{source.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {source.itemCount} items synced
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </TabsContent>

        {/* Agent Tab */}
        <TabsContent value="agent" className="mt-4 space-y-4">
          <div className="rounded-xl border border-border bg-card p-5 space-y-6">
            <h3 className="text-sm font-semibold">Agent Preferences</h3>

            <div className="space-y-2">
              <label className="text-sm font-medium">Summary Length</label>
              <div className="flex gap-2">
                <Button
                  variant={summaryLength === "brief" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSummaryLength("brief")}
                >
                  Brief
                </Button>
                <Button
                  variant={
                    summaryLength === "detailed" ? "default" : "outline"
                  }
                  size="sm"
                  onClick={() => setSummaryLength("detailed")}
                >
                  Detailed
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Controls how long the AI-generated summaries will be
              </p>
            </div>

            <Separator />

            <div className="space-y-2">
              <label className="text-sm font-medium">
                Polling Frequency (minutes)
              </label>
              <Input
                type="number"
                value={pollingFrequency}
                onChange={(e) => setPollingFrequency(e.target.value)}
                className="h-9 w-32"
                min="5"
                max="120"
              />
              <p className="text-xs text-muted-foreground">
                How often the agent checks sources for new content (5-120 min)
              </p>
            </div>

            <Separator />

            <div className="space-y-2">
              <label className="text-sm font-medium">Priority Weights</label>
              <div className="space-y-3">
                {[
                  {
                    label: "Recency",
                    desc: "Newer content ranks higher",
                    value: 70,
                  },
                  {
                    label: "Topic Relevance",
                    desc: "Content matching your topics ranks higher",
                    value: 90,
                  },
                  {
                    label: "Source Reliability",
                    desc: "Trusted sources rank higher",
                    value: 60,
                  },
                ].map((weight) => (
                  <div
                    key={weight.label}
                    className="flex items-center justify-between"
                  >
                    <div>
                      <p className="text-sm">{weight.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {weight.desc}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-24 rounded-full bg-secondary">
                        <div
                          className="h-1.5 rounded-full bg-primary"
                          style={{ width: `${weight.value}%` }}
                        />
                      </div>
                      <span className="w-8 text-xs text-muted-foreground">
                        {weight.value}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Topics Tab */}
        <TabsContent value="topics" className="mt-4 space-y-4">
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="mb-4 text-sm font-semibold">Managed Topics</h3>
            <div className="space-y-2">
              {topics.length === 0 ? (
                <p className="py-2 text-sm text-muted-foreground">
                  No topics yet. Topics appear automatically as you add content.
                </p>
              ) : (
                topics.map((topic) => (
                  <div
                    key={topic.name}
                    className="flex items-center justify-between rounded-lg border border-border p-3"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: topic.color }}
                      />
                      <div>
                        <p className="text-sm font-medium">{topic.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {topic.itemCount} items
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications" className="mt-4 space-y-4">
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <h3 className="text-sm font-semibold">Notification Preferences</h3>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">High priority items</p>
                <p className="text-xs text-muted-foreground">
                  Get notified when high-priority content arrives
                </p>
              </div>
              <Button
                variant={highPriorityEnabled ? "default" : "outline"}
                size="sm"
                onClick={toggleHighPriority}
              >
                {highPriorityEnabled ? "On" : "Off"}
              </Button>
            </div>

            {[
              {
                label: "Daily digest",
                desc: "Receive a summary of the day's content each morning",
              },
              {
                label: "New source content",
                desc: "Notify when a new source starts syncing",
              },
              {
                label: "Trend alerts",
                desc: "Alert when a topic is trending across sources",
              },
            ].map((pref) => (
              <div
                key={pref.label}
                className="flex items-center justify-between opacity-50"
              >
                <div>
                  <p className="text-sm font-medium">{pref.label}</p>
                  <p className="text-xs text-muted-foreground">{pref.desc}</p>
                </div>
                <Badge variant="secondary" className="text-[10px]">
                  Coming soon
                </Badge>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* Email Intelligence Tab */}
        <TabsContent value="email-intelligence" className="mt-4 space-y-4">
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <div>
              <h3 className="text-sm font-semibold">Email Intelligence</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Control which types of emails are ingested into your feed. The
                AI will classify incoming emails and only process the selected
                categories.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {EMAIL_CATEGORIES.map((cat) => {
                const isEnabled = allowedEmailCategories.includes(cat.id);
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => toggleEmailCategory(cat.id)}
                    className={`flex items-start justify-between gap-3 rounded-lg border p-3 text-left transition-colors ${
                      isEnabled
                        ? "border-primary bg-primary/5"
                        : "border-border bg-muted/30 hover:bg-muted/50"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{cat.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {cat.description}
                      </p>
                    </div>
                    <Button
                      variant={isEnabled ? "default" : "outline"}
                      size="sm"
                      className="shrink-0 pointer-events-none"
                    >
                      {isEnabled ? "On" : "Off"}
                    </Button>
                  </button>
                );
              })}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Danger Zone */}
      <div className="rounded-xl border border-destructive/40 bg-card p-5">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-destructive">
          <Trash2 className="h-4 w-4" /> Danger Zone
        </h3>

        {deleteStatus === "done" ? (
          <p className="text-sm text-muted-foreground">
            All data has been deleted successfully.
          </p>
        ) : deleteStatus === "confirm" || deleteStatus === "deleting" ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Enter the password to permanently delete all items, summaries,
              feedback, and sync history.
            </p>
            <div className="flex gap-2">
              <Input
                ref={passwordInputRef}
                type="password"
                placeholder="Password"
                value={deletePassword}
                onChange={(e) => {
                  setDeletePassword(e.target.value);
                  setDeleteError("");
                }}
                onKeyDown={(e) => e.key === "Enter" && handleDeleteAllData()}
                className="h-9 w-48"
                disabled={deleteStatus === "deleting"}
              />
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDeleteAllData}
                disabled={
                  deleteStatus === "deleting" || deletePassword.length === 0
                }
              >
                {deleteStatus === "deleting"
                  ? "Deleting\u2026"
                  : "Confirm Delete"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setDeleteStatus("idle");
                  setDeletePassword("");
                  setDeleteError("");
                }}
                disabled={deleteStatus === "deleting"}
              >
                Cancel
              </Button>
            </div>
            {deleteError && (
              <p className="text-xs text-destructive">{deleteError}</p>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Delete all data</p>
              <p className="text-xs text-muted-foreground">
                Permanently removes all items, summaries, feedback, and sync
                history.
              </p>
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                setDeleteStatus("confirm");
                setTimeout(() => passwordInputRef.current?.focus(), 50);
              }}
            >
              Delete all data
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
