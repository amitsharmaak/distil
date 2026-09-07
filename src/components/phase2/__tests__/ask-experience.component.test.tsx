/** @jest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";

import { AskExperience } from "../ask-experience";
import type { GroundedAnswerResponse } from "@/lib/knowledge/service";

jest.mock("@/lib/config", () => ({ config: { apiBaseUrl: "https://distil.test" } }));

const answer: GroundedAnswerResponse = {
  status: "ready",
  intent: "specific",
  answer: "Queues preserve work across restarts.",
  citations: [
    {
      id: "citation-1",
      itemId: "item-1",
      chunkId: "chunk-1",
      exactExcerpt: "A durable queue preserves work across restarts.",
      title: "Durable queues",
      url: "https://example.test/queues",
      sourceType: "manual",
    },
  ],
  passagesUsed: 1,
  retrievalMode: "keyword",
  degradation: [],
};

function ok(value: unknown): Response {
  return { ok: true, status: 200, json: jest.fn().mockResolvedValue(value) } as unknown as Response;
}

describe("AskExperience", () => {
  let fetchMock: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    fetchMock = jest.mocked(global.fetch);
    fetchMock.mockResolvedValue(ok(answer));
  });

  it("shows the empty prompt and mobile-sized ask controls", () => {
    render(<AskExperience />);
    expect(
      screen.getByText("Ask a specific question about your saved content.")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ask" })).toHaveClass("min-h-12");
  });

  it("renders a ready answer with validated source excerpts", async () => {
    render(<AskExperience />);
    fireEvent.change(screen.getByLabelText("Question"), {
      target: { value: "How do queues work?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));
    expect(await screen.findByText("Queues preserve work across restarts.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Grounded sources" })).toBeInTheDocument();
    expect(screen.getByText("A durable queue preserves work across restarts.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Durable queues" })).toHaveAttribute(
      "href",
      "/feed/item-1"
    );
  });

  it("sends at most six prior messages as answer context", async () => {
    let index = 0;
    fetchMock.mockImplementation(() =>
      Promise.resolve(ok({ ...answer, answer: `Answer ${++index}` }))
    );
    render(<AskExperience />);
    const question = screen.getByLabelText("Question");
    for (let count = 0; count < 4; count += 1) {
      fireEvent.change(question, { target: { value: `Question ${count}` } });
      fireEvent.click(screen.getByRole("button", { name: "Ask" }));
      await screen.findByText(`Answer ${count + 1}`);
    }
    const bodies = fetchMock.mock.calls
      .filter(([, init]) => init?.method === "POST")
      .map(([, init]) => JSON.parse(String(init?.body)));
    expect(bodies.at(-1).messages).toHaveLength(6);
  });

  it("makes abstention explicit", async () => {
    fetchMock.mockResolvedValue(
      ok({
        ...answer,
        status: "abstained",
        answer: "I could not find enough evidence.",
        citations: [],
        passagesUsed: 0,
      })
    );
    render(<AskExperience />);
    fireEvent.change(screen.getByLabelText("Question"), { target: { value: "What is unknown?" } });
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));
    expect(await screen.findByText(/couldn’t find enough grounded evidence/)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Grounded sources" })).not.toBeInTheDocument();
  });

  it("discloses generator-unavailable degraded fallback", async () => {
    fetchMock.mockResolvedValue(
      ok({ ...answer, status: "degraded", answer: "Strongest passage: queues preserve work." })
    );
    render(<AskExperience />);
    fireEvent.change(screen.getByLabelText("Question"), {
      target: { value: "How do queues work?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));
    expect(await screen.findByText(/Generated answering is unavailable/)).toBeInTheDocument();
  });

  it("shows a safe API-unavailable state", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      json: jest.fn().mockResolvedValue({
        error: { code: "POSTGRES_REQUIRED", message: "Answers require PostgreSQL" },
      }),
    } as unknown as Response);
    render(<AskExperience />);
    fireEvent.change(screen.getByLabelText("Question"), {
      target: { value: "How do queues work?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));
    expect(
      await screen.findByRole("heading", { name: "Ask Distil is unavailable" })
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Search and your reader remain available");
  });
});
