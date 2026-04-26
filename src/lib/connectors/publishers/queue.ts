import "server-only";

import { db } from "../../db";

interface QueueRow {
  status: string;
  attempts: number;
}

interface StatusCountRow {
  status: string;
  count: number;
}

const MAX_ATTEMPTS = 3;

export function enqueue(publisherId: string, url: string): void {
  db.prepare(
    `INSERT OR IGNORE INTO publisher_queue (publisher_id, url, discovered_at)
     VALUES (?, ?, ?)`,
  ).run(publisherId, url, new Date().toISOString());
}

export function nextPending(publisherId: string, limit: number): string[] {
  const rows = db
    .prepare(
      `SELECT url FROM publisher_queue
       WHERE publisher_id = ? AND status = 'pending'
       ORDER BY discovered_at ASC
       LIMIT ?`,
    )
    .all(publisherId, limit) as { url: string }[];
  return rows.map((r) => r.url);
}

export function markFetched(publisherId: string, url: string): void {
  db.prepare(
    `UPDATE publisher_queue
     SET status = 'fetched'
     WHERE publisher_id = ? AND url = ?`,
  ).run(publisherId, url);
}

export function markFailed(publisherId: string, url: string, error: string): void {
  const row = db
    .prepare(
      `SELECT status, attempts FROM publisher_queue
       WHERE publisher_id = ? AND url = ?`,
    )
    .get(publisherId, url) as QueueRow | undefined;

  if (!row) return;

  const nextAttempts = row.attempts + 1;
  const nextStatus = nextAttempts >= MAX_ATTEMPTS ? "failed" : "pending";

  db.prepare(
    `UPDATE publisher_queue
     SET status = ?, last_error = ?, attempts = ?
     WHERE publisher_id = ? AND url = ?`,
  ).run(nextStatus, error, nextAttempts, publisherId, url);
}

export function getQueueStats(
  publisherId: string,
): { pending: number; fetched: number; failed: number } {
  const rows = db
    .prepare(
      `SELECT status, COUNT(*) as count FROM publisher_queue
       WHERE publisher_id = ?
       GROUP BY status`,
    )
    .all(publisherId) as StatusCountRow[];

  const stats = { pending: 0, fetched: 0, failed: 0 };
  for (const row of rows) {
    if (row.status === "pending") stats.pending = row.count;
    else if (row.status === "fetched") stats.fetched = row.count;
    else if (row.status === "failed") stats.failed = row.count;
  }
  return stats;
}
