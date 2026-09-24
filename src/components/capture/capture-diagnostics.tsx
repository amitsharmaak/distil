"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, RefreshCw, TriangleAlert } from "lucide-react";
import type { CaptureReceipt } from "@/lib/contracts/capture";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/** The captures that never produced an item, newest first. */
const QUERY = "/api/v1/captures?status=rejected,failed&limit=25";

const statusCopy = {
  rejected: {
    label: "Not ingested",
    detail: "Distil read the page but found nothing it could save.",
  },
  failed: { label: "Failed", detail: "Distil could not finish this capture." },
} as const;

function timeAgo(value: string): string {
  const seconds = Math.floor((Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** The URL without its scheme; the host is what identifies a capture at a glance. */
function readableUrl(value: string): string {
  try {
    const parsed = new URL(value);
    return `${parsed.hostname}${parsed.pathname === "/" ? "" : parsed.pathname}`;
  } catch {
    return value;
  }
}

export function CaptureDiagnostics() {
  const [receipts, setReceipts] = useState<CaptureReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [busyId, setBusyId] = useState<string>();

  const load = useCallback(async () => {
    const response = await fetch(QUERY, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error("Could not load capture diagnostics.");
    const payload = (await response.json()) as { receipts: CaptureReceipt[] };
    setReceipts(payload.receipts);
  }, []);

  useEffect(() => {
    void load()
      .catch((caught) => setError(caught instanceof Error ? caught.message : String(caught)))
      .finally(() => setLoading(false));
  }, [load]);

  /**
   * Only a transient `failed` capture can be retried — a `rejected` one would
   * reach the same verdict again, so it is saved afresh instead. A rejected URL
   * is not in the duplicate set, so a new receipt is always created.
   */
  async function retry(receipt: CaptureReceipt) {
    setBusyId(receipt.id);
    setError(undefined);
    try {
      const response = await fetch(`/api/v1/captures/${encodeURIComponent(receipt.id)}/retry`, {
        method: "POST",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error("Could not retry this capture.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not retry this capture.");
    } finally {
      setBusyId(undefined);
    }
  }

  async function saveAgain(receipt: CaptureReceipt) {
    setBusyId(receipt.id);
    setError(undefined);
    try {
      const response = await fetch("/api/v1/captures", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ url: receipt.normalizedUrl, source: "web" }),
      });
      if (!response.ok) throw new Error("Could not save this link again.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save this link again.");
    } finally {
      setBusyId(undefined);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex gap-3">
        <TriangleAlert className="mt-0.5 h-5 w-5 text-muted-foreground" />
        <div>
          <h3 className="text-sm font-semibold">Capture diagnostics</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Links that were accepted but never became an item. A save reports success as soon as it
            is queued, so a page Distil cannot read fails quietly after that.
          </p>
        </div>
      </div>

      {error && <p className="mt-4 text-xs text-destructive">{error}</p>}

      {loading ? (
        <p className="mt-5 text-xs text-muted-foreground">Loading…</p>
      ) : error && receipts.length === 0 ? null : receipts.length === 0 ? ( // A diagnostics panel must not claim nothing failed when it could not look.
        <p className="mt-5 text-xs text-muted-foreground">
          Nothing to report — every capture has produced an item.
        </p>
      ) : (
        <ul className="mt-5 space-y-3">
          {receipts.map((receipt) => {
            const copy = statusCopy[receipt.status as "rejected" | "failed"] ?? statusCopy.failed;
            return (
              <li key={receipt.id} className="rounded-lg border border-border/70 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="text-[11px]">
                    {copy.label}
                  </Badge>
                  <a
                    href={receipt.normalizedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-w-0 items-center gap-1 text-xs font-medium hover:underline"
                  >
                    <span className="truncate">{readableUrl(receipt.normalizedUrl)}</span>
                    <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                  <span className="ml-auto text-[11px] text-muted-foreground">
                    {timeAgo(receipt.createdAt)}
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {receipt.error?.message ?? copy.detail}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {receipt.error?.code && (
                    <code className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {receipt.error.code}
                    </code>
                  )}
                  {receipt.attempts > 1 && (
                    <span className="text-[10px] text-muted-foreground">
                      {receipt.attempts} attempts
                    </span>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="ml-auto h-8 gap-1.5 text-xs"
                    disabled={busyId === receipt.id}
                    onClick={() =>
                      receipt.status === "failed" && receipt.retryable
                        ? retry(receipt)
                        : saveAgain(receipt)
                    }
                  >
                    <RefreshCw className="h-3 w-3" />
                    {receipt.status === "failed" && receipt.retryable ? "Retry" : "Save again"}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
