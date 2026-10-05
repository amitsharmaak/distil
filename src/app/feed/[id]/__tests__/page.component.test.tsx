/**
 * @jest-environment jsdom
 */

import { render, screen } from "@testing-library/react";
import type { ContentItem } from "@/lib/types";
import ItemDetailPage, { metadata } from "../page";

jest.mock("next/headers", () => ({ headers: jest.fn().mockResolvedValue(new Headers()) }));
jest.mock("@/lib/auth/account-service", () => ({ resolveRequestAuthContext: jest.fn() }));

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

jest.mock("@/lib/database", () => ({
  withTenantRepositories: jest.fn(),
}));

jest.mock("@/lib/phase2/feature-flags", () => ({
  readPhase2FeatureFlags: jest.fn(() => ({ knowledgeUi: true })),
}));

jest.mock("@/lib/content-strategies", () => ({
  detectStrategy: jest.fn((url: string) => {
    if (url.includes("youtube"))
      return {
        detail: {
          showEmbedPlayer: true,
          showAISummary: false,
          showReaderContent: false,
          showTweetRenderer: false,
        },
      };
    if (url.includes("twitter"))
      return {
        detail: {
          showEmbedPlayer: false,
          showAISummary: false,
          showReaderContent: false,
          showTweetRenderer: true,
        },
      };
    if (url.includes("podcast"))
      return {
        detail: {
          showEmbedPlayer: false,
          showAISummary: false,
          showReaderContent: false,
          showTweetRenderer: false,
        },
      };
    return {
      detail: {
        showEmbedPlayer: false,
        showAISummary: true,
        showReaderContent: true,
        showTweetRenderer: false,
      },
    };
  }),
}));

jest.mock("@/components/phase2/reader-annotations", () => ({
  ReaderAnnotations: ({
    initialAnnotations,
    initialUpdatedAt,
    children,
    header,
    notes,
  }: {
    initialAnnotations?: unknown[];
    initialUpdatedAt?: number;
    children: React.ReactNode;
    header: React.ReactNode;
    notes: React.ReactNode;
  }) => (
    <div
      data-testid="reader-annotations"
      data-initial-count={initialAnnotations?.length ?? -1}
      data-initial-updated-at={initialUpdatedAt}
    >
      {header}
      {children}
      {notes}
    </div>
  ),
}));
jest.mock("@/components/phase2/reader-knowledge-controls", () => ({
  ReaderKnowledgeControls: ({
    itemId,
    initial,
  }: {
    itemId: string;
    initial?: { note: { body: string } | null; updatedAt?: number };
  }) => (
    <div
      data-testid="knowledge-controls"
      data-note={initial?.note?.body ?? ""}
      data-initial-updated-at={initial?.updatedAt}
    >
      controls:{itemId}
    </div>
  ),
}));
jest.mock("@/components/feed/detail-action-bar", () => ({
  DetailActionBar: ({
    title,
    prevId,
    nextId,
    initialReaderState,
  }: {
    title: string;
    prevId: string | null;
    nextId: string | null;
    initialReaderState?: {
      state: { archived: boolean; readingProgress: number; manualPriority: string | null };
      updatedAt?: number;
    };
  }) => (
    <div
      data-testid="actions"
      data-prev={prevId ?? ""}
      data-next={nextId ?? ""}
      data-has-state={String(Boolean(initialReaderState))}
      data-archived={String(initialReaderState?.state.archived)}
      data-progress={String(initialReaderState?.state.readingProgress)}
      data-priority={initialReaderState?.state.manualPriority ?? ""}
      data-initial-updated-at={initialReaderState?.updatedAt}
    >
      {title}
    </div>
  ),
}));
jest.mock("@/components/feed/reader-experience", () => ({
  ReaderExperience: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ReaderDisplaySettings: () => <button> Aa </button>,
}));
jest.mock("@/components/feed/reader-area-badge", () => ({
  ReaderAreaBadge: () => <span data-testid="area-badge" />,
}));
jest.mock("@/components/feed/article-navigation", () => ({
  ArticleNavigation: ({ prevId, nextId }: { prevId: string | null; nextId: string | null }) => (
    <div data-testid="navigation" data-prev={prevId ?? ""} data-next={nextId ?? ""} />
  ),
}));
jest.mock("@/components/feed/video-embed", () => ({
  VideoDisclosure: () => <div data-testid="video">video control</div>,
}));
jest.mock("@/components/feed/lazy-article-extract", () => ({
  LazyArticleExtract: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock("@/components/feed/ai-summary", () => ({
  AISummary: ({ ogSummary }: { ogSummary: string }) => <p>{ogSummary}</p>,
}));

import { resolveRequestAuthContext } from "@/lib/auth/account-service";
import { withTenantRepositories } from "@/lib/database";
import { readPhase2FeatureFlags } from "@/lib/phase2/feature-flags";

const auth = {
  userId: "11111111-1111-4111-8111-111111111111",
  actorKind: "user",
  actorId: "11111111-1111-4111-8111-111111111111",
  requestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
} as never;
const repositories = {
  items: { findById: jest.fn(), findNeighbours: jest.fn() },
  summaries: { findAll: jest.fn() },
  feedback: { findForItem: jest.fn() },
  itemNotes: { find: jest.fn() },
  annotations: { listForItem: jest.fn() },
};

beforeAll(() => {
  Object.defineProperty(globalThis, "Request", { configurable: true, value: jest.fn() });
});

function item(overrides: Partial<ContentItem> = {}): ContentItem {
  return {
    id: "item-1",
    title: "A useful article title",
    summary: "A useful summary. More context follows.",
    sourceType: "manual",
    contentType: "article",
    topics: ["systems"],
    author: "Author",
    publication: "Publication",
    url: "https://example.test/article",
    priority: "high",
    isRead: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    processingStatus: "ready",
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(resolveRequestAuthContext).mockResolvedValue(auth);
  jest
    .mocked(withTenantRepositories)
    .mockImplementation(async (_auth, operation) => operation(repositories as never));
  repositories.items.findNeighbours.mockResolvedValue({ previousId: null, nextId: null });
  repositories.items.findById.mockResolvedValue(undefined);
  repositories.summaries.findAll.mockResolvedValue({ brief: undefined, detailed: undefined });
  repositories.feedback.findForItem.mockResolvedValue(undefined);
  repositories.itemNotes.find.mockResolvedValue(undefined);
  repositories.annotations.listForItem.mockResolvedValue([]);
  jest.mocked(readPhase2FeatureFlags).mockReturnValue({ knowledgeUi: true } as never);
});

describe("reader page document policy", () => {
  it("sends no Referer, so X's video CDN serves captured MP4s to the native player", () => {
    expect(metadata.referrer).toBe("no-referrer");
  });
});

describe("feed item detail page", () => {
  it("renders a stable not-found state", async () => {
    render(
      await ItemDetailPage({
        params: Promise.resolve({ id: "missing" }),
        searchParams: Promise.resolve({}),
      })
    );
    expect(screen.getByText("Item not found")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to feed" })).toHaveAttribute("href", "/feed");
    expect(withTenantRepositories).toHaveBeenCalledWith(auth, expect.any(Function));
    expect(repositories.items.findNeighbours).not.toHaveBeenCalled();
    expect(repositories.itemNotes.find).not.toHaveBeenCalled();
    expect(repositories.annotations.listForItem).not.toHaveBeenCalled();
  });

  it("renders an article with knowledge UI and navigation context", async () => {
    const current = item({
      id: "current",
      title: "https://example.test/raw",
      thumbnailUrl: "https://example.test/unused-hero.jpg",
      archivedAt: "2026-01-02T00:00:00.000Z",
      readingProgress: 0.5,
      manualPriority: "medium",
    });
    repositories.items.findById.mockResolvedValue(current);
    repositories.items.findNeighbours.mockResolvedValue({ previousId: "previous", nextId: "next" });
    repositories.itemNotes.find.mockResolvedValue({
      itemId: "current",
      body: "Server-loaded note",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    repositories.annotations.listForItem.mockResolvedValue([
      {
        id: "annotation-1",
        itemId: "current",
        selectedQuote: "A useful summary",
        prefix: "",
        suffix: ".",
        startOffset: 0,
        endOffset: 16,
        contentHash: "sha256:test",
        contentVersion: "reader-v1:test",
        status: "active",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ]);

    render(
      await ItemDetailPage({
        params: Promise.resolve({ id: "current" }),
        searchParams: Promise.resolve({ filter: "all" }),
      })
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("A useful summary.");
    expect(screen.getByTestId("reader-annotations")).toHaveAttribute("data-initial-count", "1");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    const annotations = screen.getByTestId("reader-annotations");
    const readAt = annotations.getAttribute("data-initial-updated-at");
    expect(Number(readAt)).toBeGreaterThan(0);
    // The note panel and the overflow menu are seeded from the same server read.
    const controls = screen.getByTestId("knowledge-controls");
    expect(controls).toHaveTextContent("current");
    expect(controls).toHaveAttribute("data-note", "Server-loaded note");
    expect(controls).toHaveAttribute("data-initial-updated-at", readAt);
    const actions = screen.getByTestId("actions");
    expect(actions).toHaveTextContent("https://example.test/raw");
    expect(actions).toHaveAttribute("data-archived", "true");
    expect(actions).toHaveAttribute("data-progress", "0.5");
    expect(actions).toHaveAttribute("data-priority", "medium");
    expect(actions).toHaveAttribute("data-initial-updated-at", readAt);
    // The whole read runs inside one tenant transaction; neighbours come from a
    // keyset lookup that ignores read state when the reader shows everything.
    expect(withTenantRepositories).toHaveBeenCalledTimes(1);
    expect(repositories.items.findNeighbours).toHaveBeenCalledWith("current", {
      unreadOnly: false,
    });
    expect(repositories.itemNotes.find).toHaveBeenCalledWith("current");
    expect(repositories.annotations.listForItem).toHaveBeenCalledWith("current");
    expect(screen.getByTestId("navigation")).toHaveAttribute("data-prev", "previous");
    expect(screen.getByTestId("navigation")).toHaveAttribute("data-next", "next");
    expect(screen.getByTestId("actions")).toHaveAttribute("data-prev", "previous");
    expect(screen.getByTestId("actions")).toHaveAttribute("data-next", "next");
  });

  it("asks for unread neighbours only when no filter widens the reader", async () => {
    repositories.items.findById.mockResolvedValue(item({ id: "current" }));
    repositories.items.findNeighbours.mockResolvedValue({ previousId: null, nextId: "next" });

    render(
      await ItemDetailPage({
        params: Promise.resolve({ id: "current" }),
        searchParams: Promise.resolve({}),
      })
    );
    expect(repositories.items.findNeighbours).toHaveBeenCalledWith("current", {
      unreadOnly: true,
    });
    expect(screen.getByTestId("navigation")).toHaveAttribute("data-prev", "");
    expect(screen.getByTestId("navigation")).toHaveAttribute("data-next", "next");
    expect(screen.getByTestId("actions")).toHaveAttribute("data-next", "next");
  });

  it("renders tweet tokens, video, and podcast variants with knowledge disabled", async () => {
    jest.mocked(readPhase2FeatureFlags).mockReturnValue({ knowledgeUi: false } as never);
    const variants = [
      item({
        id: "tweet",
        title: "Tweet",
        summary: "Hello @reader #systems https://example.com/a-very-long-link-that-is-truncated",
        sourceType: "publisher",
        url: "https://twitter.com/example/status/1",
        topics: [],
        author: undefined,
        publication: undefined,
      }),
      item({
        id: "video",
        title: "Video",
        contentType: "video",
        sourceType: "gmail",
        url: "https://youtube.com/watch?v=abc",
        duration: "12:30",
      }),
      item({
        id: "podcast",
        title: "Podcast",
        contentType: "podcast",
        sourceType: "slack",
        url: "https://example.com/podcast",
        duration: "45 min",
      }),
    ];
    for (const current of variants) {
      repositories.items.findById.mockResolvedValueOnce(current);
      const result = await ItemDetailPage({
        params: Promise.resolve({ id: current.id }),
        searchParams: Promise.resolve({}),
      });
      render(result);
    }
    expect(screen.getByText("@reader")).toBeInTheDocument();
    expect(screen.getByTestId("video")).toBeInTheDocument();
    expect(screen.getByText("Listen to this episode")).toBeInTheDocument();
    expect(screen.queryByTestId("knowledge-controls")).not.toBeInTheDocument();
    expect(repositories.itemNotes.find).not.toHaveBeenCalled();
    expect(repositories.annotations.listForItem).not.toHaveBeenCalled();
  });
});
