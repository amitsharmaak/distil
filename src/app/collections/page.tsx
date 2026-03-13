"use client";

import { useState } from "react";
import { Bookmark, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCollections } from "@/hooks/use-collections";

export default function CollectionsPage() {
  const { collections, createCollection, deleteCollection } = useCollections();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    createCollection(name);
    setNewName("");
    setCreating(false);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl font-semibold tracking-tight">Collections</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Organize saved items into named collections
          </p>
        </div>
        <Button size="sm" onClick={() => setCreating(true)} className="gap-1.5">
          <Plus className="h-4 w-4" /> New collection
        </Button>
      </div>

      {creating && (
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-4">
          <Input
            autoFocus
            placeholder="Collection name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
              if (e.key === "Escape") {
                setCreating(false);
                setNewName("");
              }
            }}
            className="h-9 flex-1"
          />
          <Button size="sm" onClick={handleCreate} disabled={!newName.trim()}>
            Create
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setCreating(false);
              setNewName("");
            }}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {collections.length === 0 && !creating ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="rounded-full bg-muted p-4">
            <Bookmark className="h-8 w-8 text-muted-foreground" />
          </div>
          <p className="mt-4 text-sm font-medium">No collections yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Create a collection to organize items you want to revisit
          </p>
          <Button size="sm" className="mt-4 gap-1.5" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> Create your first collection
          </Button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {collections.map((collection) => (
            <div
              key={collection.id}
              className="group relative rounded-xl border border-border bg-card p-5 transition-shadow hover:shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-medium leading-snug">{collection.name}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {collection.itemIds.length === 0
                      ? "Empty"
                      : `${collection.itemIds.length} item${collection.itemIds.length === 1 ? "" : "s"}`}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                  onClick={() => deleteCollection(collection.id)}
                  aria-label="Delete collection"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
