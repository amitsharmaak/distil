"use client";

import Link from "next/link";
import { Bookmark, Clock3 } from "lucide-react";
import type { KnowledgeItem } from "./types";

type TodayPrototypeProps = {
  priority: KnowledgeItem[];
  revisiting: KnowledgeItem[];
};

function TodayItem({ item }: { item: KnowledgeItem }) {
  return (
    <li>
      <Link
        href={item.href}
        className="block rounded-xl border border-border bg-card p-4 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-muted-foreground">{item.source}</p>
            <h3 className="mt-1 font-serif text-lg font-semibold leading-snug">{item.title}</h3>
          </div>
          {!item.isRead && (
            <span
              className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-primary"
              aria-label="Unread"
            />
          )}
        </div>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.summary}</p>
        <p className="mt-3 text-xs text-muted-foreground">Why now: {item.reason}</p>
      </Link>
    </li>
  );
}

function TodaySection({
  title,
  icon,
  items,
  empty,
}: {
  title: string;
  icon: React.ReactNode;
  items: KnowledgeItem[];
  empty: string;
}) {
  return (
    <section aria-labelledby={`${title.toLowerCase().replaceAll(" ", "-")}-heading`}>
      <div className="mb-3 flex items-center gap-2">
        <span className="text-primary">{icon}</span>
        <h2
          id={`${title.toLowerCase().replaceAll(" ", "-")}-heading`}
          className="font-serif text-xl font-semibold"
        >
          {title}
        </h2>
      </div>
      {items.length ? (
        <ul className="space-y-3">
          {items.map((item) => (
            <TodayItem key={item.id} item={item} />
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">{empty}</p>
      )}
    </section>
  );
}

/** Fixture-backed prototype; the integration layer supplies ranked items later. */
export function TodayPrototype({ priority, revisiting }: TodayPrototypeProps) {
  return (
    <main className="mx-auto w-full max-w-3xl space-y-8 px-4 py-6 sm:px-6">
      <header>
        <p className="text-sm text-muted-foreground">Your reading habit</p>
        <h1 className="font-serif text-3xl font-bold">Today</h1>
      </header>
      <TodaySection
        title="Priority Reading"
        icon={<Bookmark className="h-5 w-5" />}
        items={priority}
        empty="Nothing urgent is waiting for you."
      />
      <TodaySection
        title="Worth Revisiting"
        icon={<Clock3 className="h-5 w-5" />}
        items={revisiting}
        empty="Saved ideas will return here when the timing is useful."
      />
    </main>
  );
}
