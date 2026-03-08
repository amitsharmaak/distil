"use client";

/**
 * Topics page — browse and filter content by topic.
 *
 * Shows a grid of topic cards derived from actual item data. Clicking a topic
 * filters items tagged with that topic. A dedicated Topics table will be added
 * in a future phase.
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
import { ContentCard } from "@/components/feed/content-card";
import type { ContentItem } from "@/lib/types";
import { config } from "@/lib/config";

const TOPIC_COLORS = [
  "#8B5CF6", "#06B6D4", "#F59E0B", "#10B981", "#EF4444",
  "#3B82F6", "#84CC16", "#EC4899", "#6366F1", "#F97316",
];

interface DerivedTopic {
  name: string;
  itemCount: number;
  color: string;
}

export default function TopicsPage() {
  // ── State ───────────────────────────────────────────────────────────────────

  /** The topic name the user has drilled into, or null for the grid view. */
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);

  /** All items fetched from the API. */
  const [allItems, setAllItems] = useState<ContentItem[]>([]);
  /** Topics derived from actual item data. */
  const [topics, setTopics] = useState<DerivedTopic[]>([]);

  /** Items filtered for the currently selected topic. */
  const [topicItems, setTopicItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);

  /** New topic dialog state. */
  const [newTopic, setNewTopic] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  // ── Data fetching ───────────────────────────────────────────────────────────

  useEffect(() => {
    setLoading(true);
    fetch(`${config.apiBaseUrl}/api/items`)
      .then((res) => res.json())
      .then((data: { items: ContentItem[] }) => {
        setAllItems(data.items);
        const countMap = new Map<string, number>();
        for (const item of data.items) {
          for (const t of item.topics) {
            countMap.set(t, (countMap.get(t) || 0) + 1);
          }
        }
        const derived: DerivedTopic[] = Array.from(countMap.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([name, count], i) => ({
            name,
            itemCount: count,
            color: TOPIC_COLORS[i % TOPIC_COLORS.length],
          }));
        setTopics(derived);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedTopic) {
      setTopicItems([]);
      return;
    }
    const filtered = allItems.filter((item) =>
      item.topics.some((t) => t.toLowerCase() === selectedTopic.toLowerCase())
    );
    setTopicItems(filtered);
  }, [selectedTopic, allItems]);

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

      {loading ? (
        <div className="py-8 text-center text-muted-foreground">Loading…</div>
      ) : selectedTopic ? (
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
            {topicItems.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                No items found for this topic yet.
              </div>
            ) : (
              topicItems.map((item) => <ContentCard key={item.id} item={item} />)
            )}
          </div>
        </div>
      ) : topics.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          <p>No topics yet.</p>
          <p className="text-sm mt-1">Topics will appear here automatically as you add content.</p>
        </div>
      ) : (
        // ── Topic grid view ──────────────────────────────────────────────────
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {topics.map((topic) => (
            <Card
              key={topic.name}
              className="cursor-pointer transition-colors hover:bg-accent/50"
              onClick={() => setSelectedTopic(topic.name)}
            >
              <CardContent className="p-5">
                <div className="flex items-center gap-3">
                  <div
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: topic.color }}
                  />
                  <h3 className="font-semibold">{topic.name}</h3>
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
