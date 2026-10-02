"use client";

import { IntentLink as Link } from "@/components/navigation/intent-link";
import { useState } from "react";
import { ArchiveRestore, RefreshCw } from "lucide-react";

import { PageContainer, PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { UpdatedTime } from "@/components/ui/updated-time";
import { cardExcerpt, displayTitle, publisherLabel } from "@/lib/display";
import { Button } from "@/components/ui/button";
import { CACHE_FRESHNESS, useContentQuery } from "@/lib/client-cache/content-cache";
import { useItemMutation } from "@/lib/client-cache/item-mutations";
import { useViewScroll } from "@/lib/client-cache/view-scroll";
import type { FeedItem } from "@/lib/feed/feed-query";

function ItemLink({ item }: { item: FeedItem }) {
  return (
    <Link
      href={`/feed/${item.id}`}
      className="block border-b border-border py-4 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <p className="text-xs text-muted-foreground">{publisherLabel(item)}</p>
      <h2 className="mt-1 font-serif text-lg font-semibold">{displayTitle(item)}</h2>
      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{cardExcerpt(item)}</p>
    </Link>
  );
}

interface ArchiveResponse {
  items: FeedItem[];
}

const ARCHIVE_KEY = ["library", "archive"] as const;

export function ArchiveExperience() {
  const { updateItem } = useItemMutation();
  const archiveQuery = useContentQuery<ArchiveResponse>({
    key: ARCHIVE_KEY,
    url: "/api/v1/feed?archive=only&sort=recent&limit=100",
    staleTime: CACHE_FRESHNESS.library,
  });
  const items = (archiveQuery.data?.items ?? []).filter(
    (item) => (item as FeedItem & { archived?: boolean }).archived !== false
  );
  const loading = archiveQuery.isPending && !archiveQuery.data;
  useViewScroll("archive", Boolean(archiveQuery.data));
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);
  async function restore(itemId: string) {
    setRestoring(itemId);
    setMutationError(null);
    try {
      await updateItem(itemId, { archived: false });
    } catch (cause) {
      setMutationError(cause instanceof Error ? cause.message : "Item could not be restored.");
    } finally {
      setRestoring(null);
    }
  }
  return (
    <PageContainer size="list" className="space-y-6">
      <PageHeader
        title="Archive"
        description="Items kept out of your active reading queue."
        meta={
          <span aria-live="polite" className="text-xs">
            <UpdatedTime at={archiveQuery.dataUpdatedAt} label="Last updated" />
          </span>
        }
        actions={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="min-h-11 gap-2"
            disabled={archiveQuery.isFetching}
            onClick={() => void archiveQuery.refetch()}
            aria-label="Refresh archive"
          >
            <RefreshCw
              className={`h-4 w-4 ${archiveQuery.isFetching ? "animate-spin motion-reduce:animate-none" : ""}`}
            />
            Refresh
          </Button>
        }
      />
      {(mutationError || archiveQuery.error) && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive"
        >
          {mutationError ||
            (archiveQuery.data
              ? "Refresh failed. Cached archive is still shown."
              : archiveQuery.error instanceof Error
                ? archiveQuery.error.message
                : "Unable to load archived items.")}
        </p>
      )}
      {loading ? (
        <div role="status" aria-label="Loading archive" className="space-y-4">
          {[0, 1, 2].map((row) => (
            <Skeleton key={row} className="h-24 w-full" />
          ))}
        </div>
      ) : items.length ? (
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.id} className="flex gap-2">
              <div className="min-w-0 flex-1">
                <ItemLink item={item} />
              </div>
              <Button
                type="button"
                variant="outline"
                className="mt-2 min-h-11 shrink-0 gap-2"
                disabled={restoring !== null}
                onClick={() => void restore(item.id)}
              >
                <ArchiveRestore className="h-4 w-4" />
                Restore
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          title="Nothing is archived."
          description="Archived items will stay here until you restore them."
        />
      )}
    </PageContainer>
  );
}
