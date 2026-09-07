import type { KnowledgeItem, ReaderKnowledgeFixture } from "./types";

export const todayFixture: { priority: KnowledgeItem[]; revisiting: KnowledgeItem[] } = {
  priority: [
    {
      id: "priority-1",
      title: "A practical guide to resilient systems",
      summary: "The operational patterns worth applying this week.",
      source: "The Ken",
      href: "/feed/priority-1",
      reason: "High priority · unread",
    },
    {
      id: "priority-2",
      title: "The economics of AI infrastructure",
      summary: "What current spend tells us about the market.",
      source: "Stratechery",
      href: "/feed/priority-2",
      reason: "Matches your technology focus",
    },
  ],
  revisiting: [
    {
      id: "revisit-1",
      title: "Building a durable product cadence",
      summary: "A saved essay you opened three weeks ago.",
      source: "Lenny's Newsletter",
      href: "/feed/revisit-1",
      isRead: true,
      reason: "Saved to Product · opened 21 days ago",
    },
  ],
};

export const readerKnowledgeFixture: ReaderKnowledgeFixture = {
  itemId: "reader-1",
  title: "A practical guide to resilient systems",
  source: "The Ken",
  body: [
    "Resilient systems make ordinary failure easy to contain and easy to understand.",
    "The best operational teams write down the decision, its evidence, and the condition that would cause them to revisit it.",
  ],
  note: "Use this framing for the next reliability review.",
  collections: [
    { id: "product", name: "Product", selected: true },
    { id: "leadership", name: "Leadership", selected: false },
  ],
  annotations: [
    {
      id: "annotation-1",
      quote: "write down the decision, its evidence",
      comment: "Useful operating principle.",
      state: "active",
    },
  ],
  intelligenceState: "degraded",
  degradedReason: "The source was captured, but the AI summary could not be refreshed.",
};
