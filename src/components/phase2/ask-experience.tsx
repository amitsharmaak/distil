"use client";

import Link from "next/link";
import { useState } from "react";
import { AlertCircle, Bot, ExternalLink, Loader2, Send, User } from "lucide-react";

import { Button } from "@/components/ui/button";
import { config } from "@/lib/config";
import type { GroundedAnswerResponse, ValidatedCitation } from "@/lib/knowledge/service";

type Message = { role: "user" | "assistant"; content: string };
type AskError = Error & { code?: string; status?: number };

async function requestAnswer(query: string, messages: Message[]): Promise<GroundedAnswerResponse> {
  const response = await fetch(`${config.apiBaseUrl}/api/v1/answers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, messages: messages.slice(-6) }),
  });
  const payload = (await response.json().catch(() => ({}))) as GroundedAnswerResponse & {
    error?: { code?: string; message?: string };
  };
  if (!response.ok) {
    const error = new Error(payload.error?.message || "Ask Distil is unavailable.") as AskError;
    error.code = payload.error?.code;
    error.status = response.status;
    throw error;
  }
  return payload;
}

function CitationList({ citations }: { citations: ValidatedCitation[] }) {
  if (!citations.length) return null;
  return (
    <section className="mt-4 border-t pt-3" aria-labelledby="answer-sources-heading">
      <h3
        id="answer-sources-heading"
        className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
      >
        Grounded sources
      </h3>
      <ol className="mt-2 space-y-2">
        {citations.map((citation, index) => (
          <li key={citation.id} className="rounded-lg border p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                {index + 1}
              </span>
              <Link
                href={`/feed/${citation.itemId}`}
                className="font-medium text-primary hover:underline"
              >
                {citation.title}
              </Link>
              <a
                href={citation.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Open original source for ${citation.title}`}
                className="text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
            <blockquote className="mt-2 border-l-2 border-primary/30 pl-3 text-xs leading-5 text-muted-foreground">
              {citation.exactExcerpt}
            </blockquote>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function AskExperience() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [answer, setAnswer] = useState<GroundedAnswerResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  async function ask(event: React.FormEvent) {
    event.preventDefault();
    const query = input.trim();
    if (!query || loading) return;
    const context = messages.slice(-6);
    setMessages((current) => [...current, { role: "user", content: query }]);
    setInput("");
    setLoading(true);
    setError(null);
    setUnavailable(false);
    try {
      const result = await requestAnswer(query, context);
      setAnswer(result);
      setMessages((current) => [...current, { role: "assistant", content: result.answer }]);
    } catch (cause) {
      const apiError = cause as AskError;
      if (apiError.status === 503 || apiError.code === "POSTGRES_REQUIRED") setUnavailable(true);
      setError(cause instanceof Error ? cause.message : "Ask Distil is unavailable.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6" aria-labelledby="ask-heading">
      <header>
        <h1 id="ask-heading" className="font-serif text-3xl font-semibold">
          Ask Distil
        </h1>
        <p className="mt-1 text-muted-foreground">
          Ask questions about your saved knowledge. Answers abstain when the evidence is not strong
          enough.
        </p>
      </header>

      <section
        className="rounded-xl border bg-card p-4 sm:p-5"
        aria-label="Ask Distil conversation"
      >
        {!messages.length && !loading && (
          <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
            <Bot className="h-10 w-10 opacity-20" />
            <p className="mt-3 text-sm">Ask a specific question about your saved content.</p>
            <p className="mt-1 text-xs">
              I use up to six recent messages for context and show the source excerpts behind each
              answer.
            </p>
          </div>
        )}
        {messages.length > 0 && (
          <ol className="space-y-4" aria-label="Conversation messages">
            {messages.map((message, index) => (
              <li
                key={`${message.role}-${index}`}
                className={`flex gap-3 ${message.role === "user" ? "justify-end" : ""}`}
              >
                {message.role === "assistant" && (
                  <Bot className="mt-1 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                )}
                <p
                  className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm leading-6 ${message.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}
                >
                  {message.content}
                </p>
                {message.role === "user" && (
                  <User
                    className="mt-1 h-5 w-5 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                )}
              </li>
            ))}
          </ol>
        )}
        {loading && (
          <p role="status" className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Searching saved passages…
          </p>
        )}
        {answer?.status === "degraded" && (
          <p
            role="status"
            className="mt-4 rounded-lg border border-amber-400/50 bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100"
          >
            Generated answering is unavailable. I’m showing the strongest ranked saved passages
            instead, with their exact excerpts.
          </p>
        )}
        {answer?.status === "abstained" && (
          <p
            role="status"
            className="mt-4 rounded-lg border border-border p-3 text-sm text-muted-foreground"
          >
            I couldn’t find enough grounded evidence in your saved knowledge to answer that, so I’m
            abstaining.
          </p>
        )}
        {answer && <CitationList citations={answer.citations} />}
      </section>

      {unavailable && (
        <section
          role="alert"
          className="rounded-xl border border-amber-400/50 bg-amber-50 p-4 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100"
        >
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <div>
              <h2 className="font-semibold">Ask Distil is unavailable</h2>
              <p className="mt-1">{error}</p>
              <p className="mt-2">Search and your reader remain available.</p>
            </div>
          </div>
        </section>
      )}
      {!unavailable && error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <form onSubmit={ask} className="flex items-end gap-2" aria-label="Ask a question">
        <label className="sr-only" htmlFor="ask-question">
          Question
        </label>
        <textarea
          id="ask-question"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask about your saved content…"
          rows={2}
          className="min-h-12 flex-1 resize-y rounded-md border bg-background p-3 text-base"
          disabled={loading}
        />
        <Button type="submit" disabled={!input.trim() || loading} className="min-h-12 gap-2">
          <Send className="h-4 w-4" /> Ask
        </Button>
      </form>
    </main>
  );
}
