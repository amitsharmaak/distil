"use client";

import { useState } from "react";
import {
  Mail,
  Hash,
  MessageCircle,
  Twitter,
  Linkedin,
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
import { mockSources, mockTopics } from "@/lib/mock-data";

const sourceIcons: Record<string, React.ElementType> = {
  Mail,
  Hash,
  MessageCircle,
  Twitter,
  Linkedin,
  Globe,
  Link: LinkIcon,
};

export default function SettingsPage() {
  const [summaryLength, setSummaryLength] = useState<"brief" | "detailed">("detailed");
  const [pollingFrequency, setPollingFrequency] = useState("15");

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
              {mockSources.map((source) => {
                const IconComponent = sourceIcons[source.icon];
                return (
                  <div
                    key={source.id}
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
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={source.isConnected ? "default" : "secondary"}
                        className="text-[10px]"
                      >
                        {source.isConnected ? "Connected" : "Disconnected"}
                      </Badge>
                      <Button variant="outline" size="sm">
                        {source.isConnected ? "Disconnect" : "Connect"}
                      </Button>
                    </div>
                  </div>
                );
              })}
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
              {mockTopics.map((topic) => (
                <div
                  key={topic.id}
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
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={topic.isActive ? "default" : "secondary"}
                      className="text-[10px]"
                    >
                      {topic.isActive ? "Active" : "Paused"}
                    </Badge>
                    <Button variant="outline" size="sm">
                      {topic.isActive ? "Pause" : "Resume"}
                    </Button>
                  </div>
                </div>
              ))}
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
              {[
                {
                  label: "High priority items",
                  desc: "Get notified when high-priority content arrives",
                  enabled: true,
                },
                {
                  label: "Daily digest",
                  desc: "Receive a summary of the day's content each morning",
                  enabled: true,
                },
                {
                  label: "New source content",
                  desc: "Notify when a new source starts syncing",
                  enabled: false,
                },
                {
                  label: "Trend alerts",
                  desc: "Alert when a topic is trending across sources",
                  enabled: false,
                },
              ].map((pref) => (
                <div key={pref.label} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{pref.label}</p>
                    <p className="text-xs text-muted-foreground">{pref.desc}</p>
                  </div>
                  <Button variant="outline" size="sm">
                    {pref.enabled ? "On" : "Off"}
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
