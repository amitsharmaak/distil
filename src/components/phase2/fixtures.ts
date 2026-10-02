import type { KnowledgeItem } from "./types";

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
