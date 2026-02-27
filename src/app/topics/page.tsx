"use client";

/**
 * Topics page — browse and filter content by topic.
 *
 * Shows a grid of topic cards. Clicking a topic fetches items tagged with
 * that topic from the API and displays them as a filtered feed.
 *
 * The topic card list (names, colors, counts) still uses mockTopics for now —
 * a dedicated Topics table will be added in a future phase. The items within
 * each topic are loaded live from the API.
 */

import { useState, useEffect } from "react";
import Link from "next/link";
import { Plus, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
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
// mockTopics used for topic card display (name, color, active state).
// Items within each topic are fetched live from the API.
import { mockTopics } from "@/lib/mock-data";
import { ContentCard } from "@/components/feed/content-card";
import type { ContentItem } from "@/lib/types";
import { config } from "@/lib/config";

export default function TopicsPage() {
  // ── State ───────────────────────────────────────────────────────────────────

  /** The topic name the user has drilled into, or null for the grid view. */
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);

  /** Items fetched for the currently selected topic. */
  const [topicItems, setTopicItems] = useState<ContentItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);

  /** New topic dialog state. */
  const [newTopic, setNewTopic] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  // ── Data fetching ───────────────────────────────────────────────────────────

  /**
   * When a topic is selected, fetch all items and filter client-side by topic
   * name. This avoids a dedicated /api/items?topic= endpoint for now — the full
   * item list is small enough to filter in memory.
   */
  useEffect(() => {
    if (!selectedTopic) {
      setTopicItems([]);
      return;
    }

    setLoadingItems(true);
    fetch(`${config.apiBaseUrl}/api/items`)
      .then((res) => res.json())
      .then((data: { items: ContentItem[] }) => {
        // Filter items that have the selected topic (case-insensitive match).
        const filtered = data.items.filter((item) =>
          item.topics.some((t) => t.toLowerCase() === selectedTopic.toLowerCase())
        );
        setTopicItems(filtered);
        setLoadingItems(false);
      })
      .catch(() => setLoadingItems(false));
  }, [selectedTopic]);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Page header + Add Topic button */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Topics</h1>
          <p className="text-muted-foreground">Topics the agent monitors for you</p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" /> Add Topic
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add a new topic</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <Input
                placeholder="e.g. Quantum Computing, Climate Tech..."
                value={newTopic}
                onChange={(e) => setNewTopic(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                The agent will start monitoring this topic across all your connected sources and
                fetch relevant content.
              </p>
              {/* "Start Monitoring" is a future feature — topic persistence not yet implemented */}
              <Button
                className="w-full"
                onClick={() => {
                  setNewTopic("");
                  setDialogOpen(false);
                }}
              >
                Start Monitoring
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {selectedTopic ? (
        // ── Topic drill-down view ────────────────────────────────────────────
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelectedTopic(null)}>
              <X className="h-4 w-4 mr-1" /> Clear
            </Button>
            <h2 className="text-lg font-semibold">{selectedTopic}</h2>
            <Badge variant="secondary">{topicItems.length} items</Badge>
          </div>

          <div className="space-y-3">
            {loadingItems ? (
              <div className="py-8 text-center text-muted-foreground">Loading…</div>
            ) : topicItems.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                No items found for this topic yet.
              </div>
            ) : (
              topicItems.map((item) => <ContentCard key={item.id} item={item} />)
            )}
          </div>
        </div>
      ) : (
        // ── Topic grid view ──────────────────────────────────────────────────
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {mockTopics.map((topic) => (
            <Card
              key={topic.id}
              className="cursor-pointer transition-colors hover:bg-accent/50"
              onClick={() => setSelectedTopic(topic.name)}
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    {/* Coloured dot matching the topic's configured color */}
                    <div
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: topic.color }}
                    />
                    <h3 className="font-semibold">{topic.name}</h3>
                  </div>
                  <Badge variant={topic.isActive ? "default" : "secondary"} className="text-[10px]">
                    {topic.isActive ? "Active" : "Paused"}
                  </Badge>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">
                  {topic.itemCount} items collected
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Link to feed for exploring all content */}
      {!selectedTopic && (
        <p className="text-sm text-muted-foreground">
          Click a topic to see its items, or{" "}
          <Link href="/feed" className="text-foreground hover:underline">
            browse all items in the feed
          </Link>
          .
        </p>
      )}
    </div>
  );
}
