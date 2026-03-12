"use client";

/**
 * Topics page — browse and filter content by topic.
 *
 * Editorial topic cards with item counts, drill-down into topic items.
 */

import { useState, useEffect } from "react";
import Link from "next/link";
import { Plus, ArrowLeft } from "lucide-react";
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
  "#4F46E5", "#0891B2", "#D97706", "#059669", "#DC2626",
  "#2563EB", "#65A30D", "#DB2777", "#7C3AED", "#EA580C",
];

interface DerivedTopic {
  name: string;
  itemCount: number;
  color: string;
}

export default function TopicsPage() {
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [allItems, setAllItems] = useState<ContentItem[]>([]);
  const [topics, setTopics] = useState<DerivedTopic[]>([]);
  const [topicItems, setTopicItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTopic, setNewTopic] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

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
      item.topics.some(
        (t) => t.toLowerCase() === selectedTopic.toLowerCase(),
      ),
    );
    setTopicItems(filtered);
  }, [selectedTopic, allItems]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl font-semibold tracking-tight">
            Topics
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Topics the agent monitors for you
          </p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Add Topic
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
                The agent will start monitoring this topic across all your
                connected sources and fetch relevant content.
              </p>
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
        <div className="py-16 text-center text-sm text-muted-foreground">
          Loading&hellip;
        </div>
      ) : selectedTopic ? (
        /* Topic drill-down */
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedTopic(null)}
              className="gap-1.5"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </Button>
            <h2 className="font-serif text-lg font-semibold">
              {selectedTopic}
            </h2>
            <Badge variant="secondary" className="text-xs">
              {topicItems.length} items
            </Badge>
          </div>

          <div className="space-y-3">
            {topicItems.length === 0 ? (
              <div className="py-16 text-center text-sm text-muted-foreground">
                No items found for this topic yet.
              </div>
            ) : (
              topicItems.map((item) => (
                <ContentCard key={item.id} item={item} />
              ))
            )}
          </div>
        </div>
      ) : topics.length === 0 ? (
        <div className="py-16 text-center">
          <p className="font-serif text-lg text-muted-foreground">
            No topics yet
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Topics will appear here automatically as you add content.
          </p>
        </div>
      ) : (
        /* Topic grid */
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {topics.map((topic) => (
              <button
                key={topic.name}
                className="group rounded-xl border border-border bg-card p-5 text-left transition-all hover:shadow-md"
                onClick={() => setSelectedTopic(topic.name)}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: topic.color }}
                  />
                  <h3 className="font-serif font-semibold">{topic.name}</h3>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {topic.itemCount} {topic.itemCount === 1 ? "item" : "items"}{" "}
                  collected
                </p>
              </button>
            ))}
          </div>

          <p className="text-sm text-muted-foreground">
            Click a topic to see its items, or{" "}
            <Link
              href="/feed"
              className="text-foreground underline-offset-4 hover:underline"
            >
              browse all items in the feed
            </Link>
            .
          </p>
        </>
      )}
    </div>
  );
}
