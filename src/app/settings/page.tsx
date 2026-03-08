"use client";

import { useState, useEffect } from "react";
import {
  Mail,
  Hash,
  MessageCircle,
  Globe,
  Link as LinkIcon,
  Shield,
  Bot,
  Bell,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

const SOURCE_META: Record<string, { name: string; icon: string }> = {
  gmail: { name: "Gmail", icon: "Mail" },
  slack: { name: "Slack", icon: "Hash" },
  "browser-extension": { name: "Browser Extension", icon: "Globe" },
  manual: { name: "Manual Links", icon: "Link" },
};

const TOPIC_COLORS = [
  "#8B5CF6", "#06B6D4", "#F59E0B", "#10B981", "#EF4444",
  "#3B82F6", "#84CC16", "#EC4899", "#6366F1", "#F97316",
];

export default function SettingsPage() {
  const [summaryLength, setSummaryLength] = useState<"brief" | "detailed">("detailed");
  const [pollingFrequency, setPollingFrequency] = useState("15");
  const [highPriorityEnabled, setHighPriorityEnabled] = useState(true);
  const [sources, setSources] = useState<DerivedSource[]>([]);
  const [topics, setTopics] = useState<DerivedTopic[]>([]);

  useEffect(() => {
    fetch(`${config.apiBaseUrl}/api/notifications/preferences`)
      .then((res) => res.json())
      .then((data) => setHighPriorityEnabled(data.highPriorityItems))
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
          }))
        );
        setTopics(
          Array.from(topicMap.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([name, count], i) => ({
              name,
              itemCount: count,
              color: TOPIC_COLORS[i % TOPIC_COLORS.length],
            }))
        );
      })
      .catch(() => {});
  }, []);

  async function toggleHighPriority() {
    const newVal = !highPriorityEnabled;
    setHighPriorityEnabled(newVal);
    await fetch(`${config.apiBaseUrl}/api/notifications/preferences`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ highPriorityItems: newVal }),
    });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Configure your PIA preferences</p>
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
        </TabsList>

        {/* Accounts Tab */}
        <TabsContent value="accounts" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Connected Accounts</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {sources.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">
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
            </CardContent>
          </Card>
        </TabsContent>

        {/* Agent Tab */}
        <TabsContent value="agent" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Agent Preferences</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
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
                    variant={summaryLength === "detailed" ? "default" : "outline"}
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
                <label className="text-sm font-medium">Polling Frequency (minutes)</label>
                <Input
                  type="number"
                  value={pollingFrequency}
                  onChange={(e) => setPollingFrequency(e.target.value)}
                  className="w-32"
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
                    <div key={weight.label} className="flex items-center justify-between">
                      <div>
                        <p className="text-sm">{weight.label}</p>
                        <p className="text-xs text-muted-foreground">{weight.desc}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-24 rounded-full bg-muted">
                          <div
                            className="h-2 rounded-full bg-primary"
                            style={{ width: `${weight.value}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground w-8">{weight.value}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Topics Tab */}
        <TabsContent value="topics" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Managed Topics</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {topics.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">
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
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: topic.color }}
                      />
                      <div>
                        <p className="text-sm font-medium">{topic.name}</p>
                        <p className="text-xs text-muted-foreground">{topic.itemCount} items</p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Notification Preferences</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* High priority — functional toggle */}
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

              {/* Remaining preferences — coming soon */}
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
                <div key={pref.label} className="flex items-center justify-between opacity-50">
                  <div>
                    <p className="text-sm font-medium">{pref.label}</p>
                    <p className="text-xs text-muted-foreground">{pref.desc}</p>
                  </div>
                  <Badge variant="secondary" className="text-[10px]">
                    Coming soon
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
