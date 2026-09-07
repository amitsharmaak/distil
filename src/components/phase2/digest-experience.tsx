"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Clock3, ExternalLink, Loader2, Play, Sparkles, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { config } from "@/lib/config";
import type { DigestItem, DigestRun, PersonalPreferences } from "@/lib/digests/types";

type ApiError = Error & { code?: string; status?: number };

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${config.apiBaseUrl}${path}`, init);
  const payload = (await response.json().catch(() => ({}))) as T & {
    error?: { code?: string; message?: string };
  };
  if (!response.ok) {
    const error = new Error(
      payload.error?.message || "The digest request could not be completed."
    ) as ApiError;
    error.code = payload.error?.code;
    error.status = response.status;
    throw error;
  }
  return payload;
}

function localTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function formatDate(value: string, timezone: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "full",
      timeZone: timezone,
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function formatTimestamp(value: string, timezone: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: timezone,
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function statusLabel(digest: DigestRun): string {
  if (digest.status === "degraded") return "Available in deterministic fallback mode";
  if (digest.status === "ready")
    return digest.contentMode === "ai" ? "AI-assisted" : "Deterministic selection";
  if (digest.status === "pending") return "Preparing your digest";
  return "Digest generation failed";
}

function itemCategoryLabel(item: DigestItem): string {
  return item.category === "priority" ? "Priority" : "Worth revisiting";
}

function preferenceTimezoneOptions(current: string): string[] {
  return Array.from(
    new Set([
      current,
      localTimezone(),
      "UTC",
      "Asia/Kolkata",
      "America/Los_Angeles",
      "America/New_York",
      "Europe/London",
      "Asia/Singapore",
    ])
  );
}

function DigestPreferences({
  preferences,
  onChange,
  saving,
}: {
  preferences: PersonalPreferences;
  onChange: (patch: Partial<Pick<PersonalPreferences, "digestEnabled" | "digestTimezone">>) => void;
  saving: boolean;
}) {
  const timezoneOptions = preferenceTimezoneOptions(preferences.digestTimezone);
  return (
    <section className="rounded-xl border bg-card p-4" aria-labelledby="digest-preferences-heading">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="digest-preferences-heading" className="font-serif text-lg font-semibold">
            Digest preferences
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Digests are opt-in. Your local timezone controls the digest date and scheduled delivery.
          </p>
        </div>
        <label className="flex min-h-11 items-center gap-3 text-sm font-medium">
          <input
            type="checkbox"
            checked={preferences.digestEnabled}
            onChange={(event) => onChange({ digestEnabled: event.target.checked })}
            disabled={saving}
            className="h-5 w-5"
            aria-label="Enable in-app digests"
          />
          {preferences.digestEnabled ? "Enabled" : "Disabled"}
        </label>
      </div>
      <label className="mt-4 block text-sm font-medium" htmlFor="digest-timezone">
        Digest timezone
        <select
          id="digest-timezone"
          value={preferences.digestTimezone}
          onChange={(event) => onChange({ digestTimezone: event.target.value })}
          disabled={saving}
          className="mt-1 min-h-11 w-full rounded-md border bg-background px-3 text-base sm:max-w-sm"
        >
          {timezoneOptions.map((timezone) => (
            <option key={timezone} value={timezone}>
              {timezone}
            </option>
          ))}
        </select>
      </label>
      <Button
        type="button"
        variant="ghost"
        className="mt-2 min-h-11 px-0 text-sm"
        disabled={saving || preferences.digestTimezone === localTimezone()}
        onClick={() => onChange({ digestTimezone: localTimezone() })}
      >
        Use my device timezone ({localTimezone()})
      </Button>
    </section>
  );
}

function DigestItemCard({
  item,
  onDismiss,
}: {
  item: DigestItem;
  onDismiss: (itemId: string) => void;
}) {
  return (
    <li className="rounded-xl border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="rounded-full bg-primary/10 px-2.5 py-1 font-medium text-primary">
          {itemCategoryLabel(item)}
        </span>
        <span aria-hidden="true">·</span>
        <span>{item.reason}</span>
      </div>
      <h3 className="mt-3 font-serif text-xl font-semibold leading-snug">
        {item.title || "Untitled"}
      </h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        {item.summary || "No summary is available."}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button asChild variant="outline" className="min-h-11 gap-2">
          <Link href={`/feed/${item.itemId}`}>
            Read item <ExternalLink className="h-4 w-4" />
          </Link>
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="min-h-11 gap-2"
          onClick={() => onDismiss(item.itemId)}
        >
          <X className="h-4 w-4" /> Dismiss item
        </Button>
      </div>
    </li>
  );
}

export function DigestExperience() {
  const [preferences, setPreferences] = useState<PersonalPreferences | null>(null);
  const [digests, setDigests] = useState<DigestRun[]>([]);
  const [dismissedItemIds, setDismissedItemIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      setUnavailable(false);
      try {
        const [preferencePayload, digestPayload] = await Promise.all([
          requestJson<{ preferences: PersonalPreferences }>("/api/v1/preferences"),
          requestJson<{ digests: DigestRun[] }>("/api/v1/digests?limit=30"),
        ]);
        if (cancelled) return;
        setPreferences(preferencePayload.preferences);
        setDigests(digestPayload.digests ?? []);
      } catch (cause) {
        if (cancelled) return;
        const apiError = cause as ApiError;
        if (apiError.status === 503 || apiError.code === "POSTGRES_REQUIRED") {
          setUnavailable(true);
          setError("In-app digests are unavailable until the digest service is configured.");
        } else {
          setError(cause instanceof Error ? cause.message : "Unable to load your digests.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const currentDigest = digests[0];
  const history = digests.slice(1);
  const visibleItems = useMemo(
    () =>
      currentDigest?.items.filter(
        (item) => !item.dismissedAt && !dismissedItemIds.has(item.itemId)
      ) ?? [],
    [currentDigest, dismissedItemIds]
  );

  async function updatePreferences(
    patch: Partial<Pick<PersonalPreferences, "digestEnabled" | "digestTimezone">>
  ) {
    if (!preferences || savingPreferences) return;
    const previous = preferences;
    setPreferences({ ...preferences, ...patch });
    setSavingPreferences(true);
    setError(null);
    setNotice(null);
    try {
      const payload = await requestJson<{ preferences: PersonalPreferences }>(
        "/api/v1/preferences",
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        }
      );
      setPreferences(payload.preferences);
      setNotice("Digest preferences saved");
    } catch (cause) {
      setPreferences(previous);
      setError(cause instanceof Error ? cause.message : "Digest preferences could not be saved.");
    } finally {
      setSavingPreferences(false);
    }
  }

  async function runNow() {
    if (running) return;
    setRunning(true);
    setError(null);
    setNotice(null);
    try {
      const payload = await requestJson<{ digest: DigestRun }>("/api/v1/digests/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "run",
          idempotencyKey: `manual-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        }),
      });
      setDigests((current) => [
        payload.digest,
        ...current.filter((digest) => digest.id !== payload.digest.id),
      ]);
      setDismissedItemIds(new Set());
      setNotice("Digest ready");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Digest could not be generated.");
    } finally {
      setRunning(false);
    }
  }

  async function dismissItem(itemId: string) {
    if (!currentDigest || dismissedItemIds.has(itemId)) return;
    setError(null);
    setNotice(null);
    try {
      const payload = await requestJson<{ item: DigestItem }>("/api/v1/digests/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dismiss_item", digestId: currentDigest.id, itemId }),
      });
      setDigests((current) =>
        current.map((digest) =>
          digest.id === currentDigest.id
            ? {
                ...digest,
                items: digest.items.map((item) =>
                  item.itemId === payload.item.itemId ? payload.item : item
                ),
              }
            : digest
        )
      );
      setDismissedItemIds((current) => new Set(current).add(itemId));
      setNotice("Item dismissed from this digest");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Digest item could not be dismissed.");
    }
  }

  async function dismissCurrentDigest() {
    if (!currentDigest) return;
    setError(null);
    setNotice(null);
    try {
      const payload = await requestJson<{ digest: DigestRun }>("/api/v1/digests/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dismiss", digestId: currentDigest.id }),
      });
      setDigests((current) =>
        current.map((digest) => (digest.id === payload.digest.id ? payload.digest : digest))
      );
      setNotice("Digest dismissed");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Digest could not be dismissed.");
    }
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-4xl" aria-labelledby="digests-heading">
        <p role="status" className="py-12 text-center text-muted-foreground">
          Loading digests…
        </p>
      </main>
    );
  }

  if (unavailable) {
    return (
      <main className="mx-auto max-w-4xl space-y-5" aria-labelledby="digests-heading">
        <header>
          <h1 id="digests-heading" className="font-serif text-3xl font-semibold">
            Digests
          </h1>
          <p className="mt-1 text-muted-foreground">
            A calm, prioritized view of what is worth your attention.
          </p>
        </header>
        <section
          className="rounded-xl border border-amber-400/50 bg-amber-50 p-5 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100"
          role="alert"
        >
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <h2 className="font-semibold">Digests are unavailable</h2>
              <p className="mt-1">{error}</p>
              <p className="mt-2">Your feed and saved items remain available.</p>
            </div>
          </div>
        </section>
      </main>
    );
  }

  if (!preferences) {
    return (
      <main className="mx-auto max-w-4xl" aria-labelledby="digests-heading">
        <section className="rounded-xl border border-destructive/40 p-5" role="alert">
          <h1 id="digests-heading" className="font-serif text-2xl font-semibold">
            Digests unavailable
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {error || "Preferences could not be loaded."}
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl space-y-6" aria-labelledby="digests-heading">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 id="digests-heading" className="font-serif text-3xl font-semibold">
            Digests
          </h1>
          <p className="mt-1 text-muted-foreground">
            A calm, prioritized view of what is worth your attention.
          </p>
        </div>
        {preferences.digestEnabled && (
          <Button
            type="button"
            onClick={() => void runNow()}
            disabled={running}
            className="min-h-11 gap-2"
          >
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {running ? "Running…" : "Run now"}
          </Button>
        )}
      </header>

      <DigestPreferences
        preferences={preferences}
        onChange={(patch) => void updatePreferences(patch)}
        saving={savingPreferences}
      />

      {!preferences.digestEnabled ? (
        <section
          className="rounded-xl border border-dashed p-6"
          aria-labelledby="digest-opt-in-heading"
        >
          <h2 id="digest-opt-in-heading" className="font-serif text-xl font-semibold">
            Digests are off
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Turn on in-app digests when you want Distil to prepare a small, explainable reading
            queue in your local timezone.
          </p>
          <Button
            type="button"
            onClick={() => void updatePreferences({ digestEnabled: true })}
            disabled={savingPreferences}
            className="mt-4 min-h-11"
          >
            Enable in-app digests
          </Button>
        </section>
      ) : (
        <>
          <section className="space-y-4" aria-labelledby="current-digest-heading">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="current-digest-heading" className="font-serif text-2xl font-semibold">
                Latest digest
              </h2>
              {currentDigest && (
                <span className="text-sm text-muted-foreground">
                  {formatDate(currentDigest.localDate, currentDigest.timezone)}
                </span>
              )}
            </div>
            {currentDigest ? (
              <article className="rounded-xl border bg-card p-5 sm:p-6">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="rounded-full bg-secondary px-2.5 py-1 font-medium">
                    {statusLabel(currentDigest)}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{formatTimestamp(currentDigest.createdAt, currentDigest.timezone)}</span>
                  {currentDigest.dismissedAt && (
                    <span className="text-amber-700 dark:text-amber-300">Dismissed</span>
                  )}
                </div>
                <h3 className="mt-3 font-serif text-2xl font-semibold">{currentDigest.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {currentDigest.summary}
                </p>
                {currentDigest.status === "degraded" && (
                  <p
                    className="mt-4 rounded-lg border border-amber-400/50 bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100"
                    role="status"
                  >
                    AI enrichment is unavailable, so this digest uses deterministic priority and
                    resurfacing reasons.
                  </p>
                )}
                {visibleItems.length ? (
                  <ol className="mt-5 space-y-3" aria-label="Digest items">
                    {visibleItems.map((item) => (
                      <DigestItemCard
                        key={item.itemId}
                        item={item}
                        onDismiss={(itemId) => void dismissItem(itemId)}
                      />
                    ))}
                  </ol>
                ) : (
                  <p className="mt-5 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                    No items remain in this digest.
                  </p>
                )}
                {!currentDigest.dismissedAt && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => void dismissCurrentDigest()}
                    className="mt-4 min-h-11 gap-2"
                  >
                    <X className="h-4 w-4" /> Dismiss digest
                  </Button>
                )}
              </article>
            ) : (
              <div className="rounded-xl border border-dashed p-6" role="status">
                <div className="flex items-start gap-3">
                  <Clock3 className="mt-0.5 h-5 w-5 text-muted-foreground" />
                  <div>
                    <h3 className="font-semibold">No digest yet</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Run one now to see your first deterministic selection.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </section>

          <section aria-labelledby="digest-history-heading">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <h2 id="digest-history-heading" className="font-serif text-2xl font-semibold">
                History
              </h2>
            </div>
            {history.length ? (
              <ul className="mt-3 space-y-2">
                {history.map((digest) => (
                  <li key={digest.id} className="rounded-lg border p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-medium">{digest.title}</h3>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(digest.localDate, digest.timezone)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{digest.summary}</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {digest.items.length} item{digest.items.length === 1 ? "" : "s"} ·{" "}
                      {statusLabel(digest)}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                No previous digests.
              </p>
            )}
          </section>
        </>
      )}

      {(error || notice) && (
        <p
          className={error ? "text-sm text-destructive" : "text-sm text-muted-foreground"}
          role={error ? "alert" : "status"}
        >
          {error || notice}
        </p>
      )}
    </main>
  );
}
