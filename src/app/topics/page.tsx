"use client";

import { useState } from "react";
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
import { mockTopics, mockItems } from "@/lib/mock-data";
import { ContentCard } from "@/components/feed/content-card";

export default function TopicsPage() {
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [newTopic, setNewTopic] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const topicItems = selectedTopic
    ? mockItems.filter((item) =>
        item.topics.some(
          (t) => t.toLowerCase() === selectedTopic.toLowerCase()
        )
      )
    : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Topics</h1>
          <p className="text-muted-foreground">
            Topics the agent monitors for you
          </p>
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

      {selectedTopic ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedTopic(null)}
            >
              <X className="h-4 w-4 mr-1" /> Clear
            </Button>
            <h2 className="text-lg font-semibold">{selectedTopic}</h2>
            <Badge variant="secondary">{topicItems.length} items</Badge>
          </div>
          <div className="space-y-3">
            {topicItems.map((item) => (
              <ContentCard key={item.id} item={item} />
            ))}
          </div>
        </div>
      ) : (
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
                    <div
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: topic.color }}
                    />
                    <h3 className="font-semibold">{topic.name}</h3>
                  </div>
                  <Badge
                    variant={topic.isActive ? "default" : "secondary"}
                    className="text-[10px]"
                  >
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
    </div>
  );
}
