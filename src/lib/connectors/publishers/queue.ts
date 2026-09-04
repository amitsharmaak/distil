import "server-only";

import {
  enqueuePublisherUrl,
  getPublisherQueueStats,
  listPendingPublisherUrls,
  markPublisherUrlFailed,
  markPublisherUrlFetched,
} from "../../database";

export async function enqueue(publisherId: string, url: string): Promise<void> {
  await enqueuePublisherUrl(publisherId, url);
}

export async function nextPending(publisherId: string, limit: number): Promise<string[]> {
  return listPendingPublisherUrls(publisherId, limit);
}

export async function markFetched(publisherId: string, url: string): Promise<void> {
  await markPublisherUrlFetched(publisherId, url);
}

export async function markFailed(publisherId: string, url: string, error: string): Promise<void> {
  await markPublisherUrlFailed(publisherId, url, error);
}

export async function getQueueStats(
  publisherId: string
): Promise<{ pending: number; fetched: number; failed: number }> {
  return getPublisherQueueStats(publisherId);
}
