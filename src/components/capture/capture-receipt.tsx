"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, Clock3, LoaderCircle, RefreshCw, XCircle } from "lucide-react";
import type { CaptureReceipt } from "@/lib/contracts/capture";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useContentCache } from "@/lib/client-cache/content-cache";

const ACTIVE_STATUSES = new Set(["queued", "processing"]);
const POLL_INTERVAL_MS = 2_000;
const POLL_TIMEOUT_MS = 120_000;

const statusCopy = {
  queued: { label: "Queued", detail: "Your article is waiting to be distilled.", Icon: Clock3 },
  processing: {
    label: "Distilling",
    detail: "Distil is reading and organizing this article.",
    Icon: LoaderCircle,
  },
  ready: { label: "Ready", detail: "Your article is ready to read.", Icon: CheckCircle2 },
  rejected: { label: "Not saved", detail: "This page could not be accepted.", Icon: XCircle },
  failed: {
    label: "Capture failed",
    detail: "Distil could not finish this capture.",
    Icon: AlertCircle,
  },
} as const;

function receiptFromPayload(payload: unknown): CaptureReceipt | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const candidate = payload as { receipt?: CaptureReceipt } & CaptureReceipt;
  return candidate.receipt ?? (typeof candidate.id === "string" ? candidate : undefined);
}

export function CaptureReceiptCard({ initialReceipt }: { initialReceipt: CaptureReceipt }) {
  const cache = useContentCache();
  const [receipt, setReceipt] = useState(initialReceipt);
  const [requestError, setRequestError] = useState<string>();
  const [retrying, setRetrying] = useState(false);
  const startedAt = useRef(Date.now());
  const request = useRef<{ controller: AbortController; promise: Promise<void> } | null>(null);
  const notifiedReady = useRef<string | null>(null);

  useEffect(() => {
    if (receipt.status !== "ready" || notifiedReady.current === receipt.id) return;
    notifiedReady.current = receipt.id;
    void cache.invalidate(["feed"]);
    void cache.invalidate(["today"]);
    if (receipt.itemId) void cache.invalidate(["item", receipt.itemId]);
  }, [cache, receipt.status, receipt.id, receipt.itemId]);

  const refresh = useCallback((): Promise<void> => {
    if (request.current) return request.current.promise;
    const controller = new AbortController();
    const promise = (async () => {
      const response = await fetch(`/api/v1/captures/${encodeURIComponent(receipt.id)}`, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("Could not refresh the capture status.");
      const next = receiptFromPayload(await response.json());
      if (!next) throw new Error("The capture status response was incomplete.");
      if (!controller.signal.aborted) {
        setReceipt(next);
        setRequestError(undefined);
      }
    })().finally(() => {
      if (request.current?.controller === controller) request.current = null;
    });
    request.current = { controller, promise };
    return promise;
  }, [receipt.id]);

  useEffect(
    () => () => {
      request.current?.controller.abort();
    },
    [receipt.id]
  );

  useEffect(() => {
    if (!ACTIVE_STATUSES.has(receipt.status)) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    let failures = 0;
    const available = () => document.visibilityState === "visible" && navigator.onLine !== false;

    const schedule = () => {
      if (cancelled || timer || !available() || Date.now() - startedAt.current >= POLL_TIMEOUT_MS)
        return;
      timer = setTimeout(
        async () => {
          timer = undefined;
          if (available()) {
            try {
              await refresh();
              failures = 0;
            } catch (error) {
              if (!cancelled && available()) {
                failures += 1;
                setRequestError(
                  error instanceof Error ? error.message : "Could not refresh status."
                );
              }
            }
          }
          schedule();
        },
        Math.min(POLL_INTERVAL_MS * 2 ** failures, 30_000)
      );
    };

    const resume = () => {
      if (!available()) {
        if (timer) clearTimeout(timer);
        timer = undefined;
        request.current?.controller.abort();
      } else if (!timer) schedule();
    };
    window.addEventListener("focus", resume);
    window.addEventListener("online", resume);
    window.addEventListener("offline", resume);
    document.addEventListener("visibilitychange", resume);
    schedule();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener("focus", resume);
      window.removeEventListener("online", resume);
      window.removeEventListener("offline", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [receipt.status, refresh]);

  async function retry() {
    if (receipt.status !== "failed" || !receipt.retryable) return;
    setRetrying(true);
    setRequestError(undefined);
    try {
      const response = await fetch(`/api/v1/captures/${encodeURIComponent(receipt.id)}/retry`, {
        method: "POST",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error("Could not retry this capture.");
      const next = receiptFromPayload(await response.json());
      if (!next) throw new Error("The retry response was incomplete.");
      startedAt.current = Date.now();
      setReceipt(next);
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "Could not retry this capture.");
    } finally {
      setRetrying(false);
    }
  }

  const { label, detail, Icon } = statusCopy[receipt.status];
  const isActive = ACTIVE_STATUSES.has(receipt.status);

  return (
    <Card aria-live="polite" className="overflow-hidden">
      <CardHeader className="grid-cols-[auto_1fr] items-center">
        <div className="row-span-2 rounded-full bg-primary/10 p-2.5 text-primary">
          <Icon className={`h-5 w-5 ${receipt.status === "processing" ? "animate-spin" : ""}`} />
        </div>
        <CardTitle className="flex flex-wrap items-center gap-2 font-serif text-xl">
          {label}
          {isActive && <Badge variant="secondary">Updates automatically</Badge>}
        </CardTitle>
        <CardDescription>{detail}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="break-all text-sm text-muted-foreground">{receipt.normalizedUrl}</p>
        {receipt.error && (
          <div
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm"
          >
            {receipt.error.message}
          </div>
        )}
        {requestError && (
          <p role="alert" className="text-sm text-destructive">
            {requestError}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {receipt.status === "ready" && receipt.itemId && (
            <Button asChild>
              <Link href={`/feed/${receipt.itemId}`}>Read article</Link>
            </Button>
          )}
          {receipt.status === "failed" && receipt.retryable && (
            <Button onClick={retry} disabled={retrying}>
              <RefreshCw className={`h-4 w-4 ${retrying ? "animate-spin" : ""}`} />
              {retrying ? "Retrying…" : "Try again"}
            </Button>
          )}
          {isActive && (
            <Button
              variant="outline"
              onClick={() =>
                void refresh().catch((error) =>
                  setRequestError(
                    error instanceof Error ? error.message : "Could not refresh status."
                  )
                )
              }
            >
              Check now
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
