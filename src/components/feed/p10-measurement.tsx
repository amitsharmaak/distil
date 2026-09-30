"use client";

/**
 * TEMPORARY P10 Preview measurement harness. Remove after the timing sample.
 *
 * It is mounted only by an authenticated `/feed?p10measure=1` render. The
 * observer records only the two target same-origin paths, rounded durations
 * and the app's allow-listed aggregate Server-Timing metrics.
 */

import { useEffect, useRef, useState } from "react";

export const P10_MEASURE_PARAM = "p10measure";
export const P10_MEASURE_VALUE = "1";
const P10_WARMUP_PARAM = "p10warmup";
const TARGET_PATHS = new Set(["/feed", "/api/v1/feed"]);
const TIMING_NAMES = new Set([
  "proxy-auth-provider",
  "proxy-auth-db",
  "proxy",
  "auth",
  "db",
  "total",
]);
const SAFE_DESCRIPTION = /^(?:(?:calls|q|tx)=\d+)(?: (?:(?:calls|q|tx)=\d+))*$/;

export interface P10MeasurementRecord {
  path: string;
  durationMs: number;
  serverTiming: Array<{ name: string; durationMs: number; description?: string }>;
}

function rounded(milliseconds: number): number {
  return Number.isFinite(milliseconds) ? Math.round(milliseconds * 10) / 10 : 0;
}

export function p10MeasurementEnabled(searchParams: Pick<URLSearchParams, "get">): boolean {
  return searchParams.get(P10_MEASURE_PARAM) === P10_MEASURE_VALUE;
}

/** Strip the URL query and reject every cross-origin or non-target resource. */
export function p10MeasurementRecord(
  entry: PerformanceResourceTiming,
  pageOrigin: string
): P10MeasurementRecord | null {
  let url: URL;
  try {
    url = new URL(entry.name, pageOrigin);
  } catch {
    return null;
  }
  const isFeedRsc = url.pathname === "/feed" && url.searchParams.has("_rsc");
  const isFeedApi = url.pathname === "/api/v1/feed";
  if (
    url.origin !== pageOrigin ||
    !TARGET_PATHS.has(url.pathname) ||
    (!isFeedRsc && !isFeedApi) ||
    url.searchParams.get(P10_WARMUP_PARAM) === P10_MEASURE_VALUE
  ) {
    return null;
  }
  const serverTiming = (entry.serverTiming ?? [])
    .filter(({ name }) => TIMING_NAMES.has(name))
    .map(({ name, duration, description }) => ({
      name,
      durationMs: rounded(duration),
      ...(description && SAFE_DESCRIPTION.test(description) ? { description } : {}),
    }));
  return { path: url.pathname, durationMs: rounded(entry.duration), serverTiming };
}

function warmupPath(apiPath: string): string {
  const url = new URL(apiPath, window.location.origin);
  url.searchParams.set(P10_WARMUP_PARAM, P10_MEASURE_VALUE);
  return `${url.pathname}${url.search}`;
}

export function P10MeasurementHarness({ apiPath }: { apiPath: string }) {
  const [apiSamples, setApiSamples] = useState(0);
  const [rscSamples, setRscSamples] = useState(0);
  const [runStatus, setRunStatus] = useState("Ready");
  const [running, setRunning] = useState(false);
  const seen = useRef(new Set<string>());

  useEffect(() => {
    if (typeof PerformanceObserver === "undefined") {
      setRunStatus("Resource timing unavailable");
      return;
    }
    const observer = new PerformanceObserver((list) => {
      for (const rawEntry of list.getEntries()) {
        if (rawEntry.entryType !== "resource") continue;
        const entry = rawEntry as PerformanceResourceTiming;
        const key = `${entry.name}|${entry.startTime}|${entry.duration}`;
        if (seen.current.has(key)) continue;
        seen.current.add(key);
        const record = p10MeasurementRecord(entry, window.location.origin);
        if (!record) continue;
        // Temporary, explicitly query-gated measurement output. The record is
        // structurally limited to path, duration and aggregate timing entries.
        console.info("[P10 measurement]", record);
        if (record.path === "/api/v1/feed") setApiSamples((count) => count + 1);
        if (record.path === "/feed") setRscSamples((count) => count + 1);
      }
    });
    observer.observe({ type: "resource" });
    return () => observer.disconnect();
  }, []);

  async function runApiSamples() {
    setRunning(true);
    setApiSamples(0);
    try {
      setRunStatus("Warming API…");
      const warmup = await fetch(warmupPath(apiPath), { cache: "no-store" });
      await warmup.arrayBuffer();
      for (let sample = 1; sample <= 4; sample += 1) {
        setRunStatus(`API sample ${sample}/4…`);
        const response = await fetch(apiPath, { cache: "no-store" });
        await response.arrayBuffer();
      }
      setRunStatus("Four API samples complete");
    } catch {
      setRunStatus("API sampling failed");
    } finally {
      setRunning(false);
    }
  }

  return (
    <aside
      className="rounded-lg border border-dashed border-amber-500/60 bg-amber-500/5 p-3 text-xs"
      aria-label="P10 Preview measurement"
    >
      <div className="flex flex-wrap items-center gap-3">
        <strong>Temporary P10 measurement</strong>
        <span aria-live="polite">{runStatus}</span>
        <span>
          Captured: API {apiSamples} · Feed RSC {rscSamples}
        </span>
        <button
          type="button"
          className="rounded border px-2 py-1 font-medium hover:bg-accent disabled:opacity-50"
          disabled={running}
          onClick={() => void runApiSamples()}
        >
          {running ? "Running…" : "Warm + run 4 API samples"}
        </button>
      </div>
      <p className="mt-2 text-muted-foreground">
        Use four Feed filter changes for RSC samples. After six minutes idle, change one filter for
        the cold sample. Results are written to the browser console.
      </p>
    </aside>
  );
}
