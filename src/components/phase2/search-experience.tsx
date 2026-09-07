"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, ExternalLink, Search as SearchIcon, SlidersHorizontal } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { config } from "@/lib/config";
import type { PassageSearchResponse, PassageSearchResult } from "@/lib/knowledge/retrieval";

const sources = ["gmail", "slack", "browser-extension", "manual", "publisher"];
const contentTypes = ["article", "video", "podcast"];
const priorities = ["high", "medium", "low"];

function queryValues(params: URLSearchParams, name: string): string[] {
  return params
    .getAll(name)
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);
}

function sameValues(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

async function requestSearch(query: URLSearchParams): Promise<PassageSearchResponse> {
  const response = await fetch(`${config.apiBaseUrl}/api/v1/search?${query.toString()}`);
  const payload = (await response.json().catch(() => ({}))) as PassageSearchResponse & {
    error?: { message?: string; code?: string };
  };
  if (!response.ok) {
    const error = new Error(payload.error?.message || "Search is unavailable.") as Error & {
      status?: number;
      code?: string;
    };
    error.status = response.status;
    error.code = payload.error?.code;
    throw error;
  }
  return payload;
}

function FilterToggle({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`min-h-10 rounded-full border px-3 text-xs font-medium transition-colors ${
        selected
          ? "border-primary/30 bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-accent"
      }`}
    >
      {label}
    </button>
  );
}

function SearchResultCard({ result }: { result: PassageSearchResult }) {
  return (
    <li className="rounded-xl border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="secondary">{result.sourceType}</Badge>
        {result.reasons.map((reason) => (
          <span key={reason}>{reason}</span>
        ))}
      </div>
      <h2 className="mt-3 font-serif text-xl font-semibold leading-snug">
        {result.title || "Untitled"}
      </h2>
      <p className="mt-2 border-l-2 border-primary/40 pl-3 text-sm leading-6 text-muted-foreground">
        {result.excerpt}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button asChild variant="outline" className="min-h-11 gap-2">
          <Link href={`/feed/${result.itemId}`}>Open in reader</Link>
        </Button>
        <Button asChild variant="ghost" className="min-h-11 gap-2">
          <a href={result.url} target="_blank" rel="noopener noreferrer">
            Original <ExternalLink className="h-4 w-4" />
          </a>
        </Button>
      </div>
    </li>
  );
}

export function SearchExperience() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = searchParams.get("q") ?? "";
  const searchParamsKey = searchParams.toString();
  const [input, setInput] = useState(query);
  const [selectedSources, setSelectedSources] = useState(() => queryValues(searchParams, "source"));
  const [selectedTypes, setSelectedTypes] = useState(() =>
    queryValues(searchParams, "contentType")
  );
  const [selectedPriorities, setSelectedPriorities] = useState(() =>
    queryValues(searchParams, "priority")
  );
  const [topic, setTopic] = useState(() => queryValues(searchParams, "topic")[0] ?? "");
  const [collection, setCollection] = useState(
    () => queryValues(searchParams, "collection")[0] ?? ""
  );
  const [read, setRead] = useState(searchParams.get("read") ?? "");
  const [archive, setArchive] = useState(searchParams.get("archive") ?? "exclude");
  const [dateFrom, setDateFrom] = useState(() => (searchParams.get("dateFrom") ?? "").slice(0, 10));
  const [dateTo, setDateTo] = useState(() => (searchParams.get("dateTo") ?? "").slice(0, 10));
  const [response, setResponse] = useState<PassageSearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(searchParamsKey);
    const nextSources = queryValues(params, "source");
    const nextTypes = queryValues(params, "contentType");
    const nextPriorities = queryValues(params, "priority");
    const nextTopic = queryValues(params, "topic")[0] ?? "";
    const nextCollection = queryValues(params, "collection")[0] ?? "";
    const nextRead = params.get("read") ?? "";
    const nextArchive = params.get("archive") ?? "exclude";
    const nextDateFrom = (params.get("dateFrom") ?? "").slice(0, 10);
    const nextDateTo = (params.get("dateTo") ?? "").slice(0, 10);
    setInput((current) => (current === query ? current : query));
    setSelectedSources((current) => (sameValues(current, nextSources) ? current : nextSources));
    setSelectedTypes((current) => (sameValues(current, nextTypes) ? current : nextTypes));
    setSelectedPriorities((current) =>
      sameValues(current, nextPriorities) ? current : nextPriorities
    );
    setTopic((current) => (current === nextTopic ? current : nextTopic));
    setCollection((current) => (current === nextCollection ? current : nextCollection));
    setRead((current) => (current === nextRead ? current : nextRead));
    setArchive((current) => (current === nextArchive ? current : nextArchive));
    setDateFrom((current) => (current === nextDateFrom ? current : nextDateFrom));
    setDateTo((current) => (current === nextDateTo ? current : nextDateTo));
  }, [query, searchParamsKey]);

  const activeFacetCount =
    selectedSources.length +
    selectedTypes.length +
    selectedPriorities.length +
    (topic ? 1 : 0) +
    (collection ? 1 : 0) +
    (read ? 1 : 0) +
    (archive !== "exclude" ? 1 : 0) +
    (dateFrom ? 1 : 0) +
    (dateTo ? 1 : 0);

  const runSearch = useCallback(async () => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResponse(null);
      setError("Enter at least two characters to search your saved knowledge.");
      return;
    }
    setLoading(true);
    setError(null);
    setUnavailable(false);
    try {
      const params = new URLSearchParams({ q: trimmed, limit: "50" });
      if (read) params.set("read", read);
      if (archive) params.set("archive", archive);
      selectedSources.forEach((value) => params.append("source", value));
      selectedTypes.forEach((value) => params.append("contentType", value));
      selectedPriorities.forEach((value) => params.append("priority", value));
      if (topic.trim()) params.set("topic", topic.trim());
      if (collection.trim()) params.set("collection", collection.trim());
      if (dateFrom) params.set("dateFrom", `${dateFrom}T00:00:00.000Z`);
      if (dateTo) params.set("dateTo", `${dateTo}T23:59:59.999Z`);
      const payload = await requestSearch(params);
      setResponse(payload);
    } catch (cause) {
      const apiError = cause as Error & { status?: number; code?: string };
      if (apiError.status === 503 || apiError.code === "POSTGRES_REQUIRED") {
        setUnavailable(true);
      }
      setError(cause instanceof Error ? cause.message : "Search is unavailable.");
      setResponse(null);
    } finally {
      setLoading(false);
    }
  }, [
    archive,
    collection,
    dateFrom,
    dateTo,
    query,
    read,
    selectedPriorities,
    selectedSources,
    selectedTypes,
    topic,
  ]);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResponse(null);
      setUnavailable(false);
      setLoading(false);
      setError(
        query.trim() ? "Enter at least two characters to search your saved knowledge." : null
      );
      return;
    }
    void runSearch();
  }, [query, runSearch]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = input.trim();
    const params = new URLSearchParams();
    if (trimmed) params.set("q", trimmed);
    selectedSources.forEach((value) => params.append("source", value));
    selectedTypes.forEach((value) => params.append("contentType", value));
    selectedPriorities.forEach((value) => params.append("priority", value));
    if (topic.trim()) params.set("topic", topic.trim());
    if (collection.trim()) params.set("collection", collection.trim());
    if (read) params.set("read", read);
    if (archive !== "exclude") params.set("archive", archive);
    if (dateFrom) params.set("dateFrom", `${dateFrom}T00:00:00.000Z`);
    if (dateTo) params.set("dateTo", `${dateTo}T23:59:59.999Z`);
    router.push(`/search${params.toString() ? `?${params.toString()}` : ""}`);
  }

  const resultCountLabel = useMemo(() => {
    if (!response) return "";
    return `${response.results.length} result${response.results.length === 1 ? "" : "s"}`;
  }, [response]);

  return (
    <main className="mx-auto max-w-4xl space-y-6" aria-labelledby="search-heading">
      <header>
        <h1 id="search-heading" className="font-serif text-3xl font-semibold">
          Search your knowledge
        </h1>
        <p className="mt-1 text-muted-foreground">
          Find grounded passages across the content you chose to keep.
        </p>
      </header>
      <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row" role="search">
        <label className="sr-only" htmlFor="knowledge-search">
          Search saved knowledge
        </label>
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            id="knowledge-search"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Search articles, notes, and passages"
            className="min-h-12 w-full rounded-md border bg-background pl-10 pr-3 text-base"
          />
        </div>
        <Button type="submit" className="min-h-12 gap-2">
          <SearchIcon className="h-4 w-4" /> Search
        </Button>
      </form>

      <section className="rounded-xl border bg-card p-4" aria-labelledby="search-filters-heading">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-primary" />
          <h2 id="search-filters-heading" className="font-medium">
            Filters
          </h2>
          {activeFacetCount > 0 && (
            <span className="text-xs text-muted-foreground">{activeFacetCount} active</span>
          )}
        </div>
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-2" aria-label="Source filters">
            {sources.map((value) => (
              <FilterToggle
                key={value}
                label={value}
                selected={selectedSources.includes(value)}
                onClick={() =>
                  setSelectedSources((current) =>
                    current.includes(value)
                      ? current.filter((entry) => entry !== value)
                      : [...current, value]
                  )
                }
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-2" aria-label="Content type filters">
            {contentTypes.map((value) => (
              <FilterToggle
                key={value}
                label={value}
                selected={selectedTypes.includes(value)}
                onClick={() =>
                  setSelectedTypes((current) =>
                    current.includes(value)
                      ? current.filter((entry) => entry !== value)
                      : [...current, value]
                  )
                }
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-2" aria-label="Priority filters">
            {priorities.map((value) => (
              <FilterToggle
                key={value}
                label={value}
                selected={selectedPriorities.includes(value)}
                onClick={() =>
                  setSelectedPriorities((current) =>
                    current.includes(value)
                      ? current.filter((entry) => entry !== value)
                      : [...current, value]
                  )
                }
              />
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs font-medium text-muted-foreground">
              Topic
              <input
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
                placeholder="e.g. AI"
                className="mt-1 min-h-11 w-full rounded-md border bg-background px-3 text-base"
              />
            </label>
            <label className="text-xs font-medium text-muted-foreground">
              Collection ID
              <input
                value={collection}
                onChange={(event) => setCollection(event.target.value)}
                placeholder="Optional"
                className="mt-1 min-h-11 w-full rounded-md border bg-background px-3 text-base"
              />
            </label>
            <label className="text-xs font-medium text-muted-foreground">
              Read
              <select
                value={read}
                onChange={(event) => setRead(event.target.value)}
                className="mt-1 min-h-11 w-full rounded-md border bg-background px-3 text-base"
              >
                <option value="">Any</option>
                <option value="false">Unread</option>
                <option value="true">Read</option>
              </select>
            </label>
            <label className="text-xs font-medium text-muted-foreground">
              Archive
              <select
                value={archive}
                onChange={(event) => setArchive(event.target.value)}
                className="mt-1 min-h-11 w-full rounded-md border bg-background px-3 text-base"
              >
                <option value="exclude">Active only</option>
                <option value="include">Include archived</option>
                <option value="only">Archived only</option>
              </select>
            </label>
            <label className="text-xs font-medium text-muted-foreground">
              From date
              <input
                type="date"
                value={dateFrom}
                onChange={(event) => setDateFrom(event.target.value)}
                className="mt-1 min-h-11 w-full rounded-md border bg-background px-3 text-base"
              />
            </label>
            <label className="text-xs font-medium text-muted-foreground">
              To date
              <input
                type="date"
                value={dateTo}
                onChange={(event) => setDateTo(event.target.value)}
                className="mt-1 min-h-11 w-full rounded-md border bg-background px-3 text-base"
              />
            </label>
          </div>
        </div>
      </section>

      {loading && (
        <p role="status" className="py-8 text-center text-muted-foreground">
          Searching…
        </p>
      )}
      {!loading && unavailable && (
        <section
          role="alert"
          className="rounded-xl border border-amber-400/50 bg-amber-50 p-5 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100"
        >
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <div>
              <h2 className="font-semibold">Search is unavailable</h2>
              <p className="mt-1">{error}</p>
              <p className="mt-2">Your feed and saved items remain available.</p>
            </div>
          </div>
        </section>
      )}
      {!loading && !unavailable && error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {!loading && !error && response && (
        <section aria-labelledby="search-results-heading">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="search-results-heading" className="font-serif text-2xl font-semibold">
              Results
            </h2>
            <span className="text-sm text-muted-foreground">{resultCountLabel}</span>
          </div>
          {response.retrievalMode === "keyword" && (
            <p
              role="status"
              className="mt-3 rounded-lg border border-amber-400/50 bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100"
            >
              Keyword mode is active. Semantic retrieval is unavailable, so results are matched
              against indexed text and metadata.
            </p>
          )}
          {response.results.length ? (
            <ul className="mt-4 space-y-3">
              {response.results.map((result) => (
                <SearchResultCard key={`${result.itemId}-${result.chunkId}`} result={result} />
              ))}
            </ul>
          ) : (
            <p
              role="status"
              className="mt-4 rounded-lg border border-dashed p-5 text-sm text-muted-foreground"
            >
              No saved passages matched this search.
            </p>
          )}
        </section>
      )}
      {!loading && !query && !error && (
        <p
          role="status"
          className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground"
        >
          Enter a query to search your saved knowledge.
        </p>
      )}
    </main>
  );
}
