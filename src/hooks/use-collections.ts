"use client";

import { useState, useEffect, useCallback } from "react";

export interface Collection {
  id: string;
  name: string;
  itemIds: string[];
  createdAt: string;
}

const STORAGE_KEY = "distil-collections";

function loadCollections(): Collection[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Collection[]) : [];
  } catch {
    return [];
  }
}

function saveCollections(collections: Collection[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(collections));
}

export function useCollections() {
  const [collections, setCollections] = useState<Collection[]>([]);

  useEffect(() => {
    setCollections(loadCollections());
  }, []);

  const createCollection = useCallback((name: string): Collection => {
    const collection: Collection = {
      id: crypto.randomUUID(),
      name: name.trim(),
      itemIds: [],
      createdAt: new Date().toISOString(),
    };
    setCollections((prev) => {
      const next = [...prev, collection];
      saveCollections(next);
      return next;
    });
    return collection;
  }, []);

  const deleteCollection = useCallback((id: string) => {
    setCollections((prev) => {
      const next = prev.filter((c) => c.id !== id);
      saveCollections(next);
      return next;
    });
  }, []);

  const addItem = useCallback((collectionId: string, itemId: string) => {
    setCollections((prev) => {
      const next = prev.map((c) =>
        c.id === collectionId && !c.itemIds.includes(itemId)
          ? { ...c, itemIds: [...c.itemIds, itemId] }
          : c,
      );
      saveCollections(next);
      return next;
    });
  }, []);

  const removeItem = useCallback((collectionId: string, itemId: string) => {
    setCollections((prev) => {
      const next = prev.map((c) =>
        c.id === collectionId
          ? { ...c, itemIds: c.itemIds.filter((id) => id !== itemId) }
          : c,
      );
      saveCollections(next);
      return next;
    });
  }, []);

  const isInCollection = useCallback(
    (collectionId: string, itemId: string): boolean => {
      return (
        collections.find((c) => c.id === collectionId)?.itemIds.includes(itemId) ?? false
      );
    },
    [collections],
  );

  return {
    collections,
    createCollection,
    deleteCollection,
    addItem,
    removeItem,
    isInCollection,
  };
}
