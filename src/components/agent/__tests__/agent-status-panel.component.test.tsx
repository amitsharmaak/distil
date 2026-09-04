/**
 * @jest-environment jsdom
 */

import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { AgentStatusPanel } from "../agent-status-panel";

jest.mock("@/lib/config", () => ({
  config: { apiBaseUrl: "https://distil.test" },
}));

jest.mock("@/components/ui/scroll-area", () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const now = new Date("2026-01-10T12:00:00.000Z");

function statusFixture() {
  return {
    runningWorkflows: [
      { id: "run-1", workflow_type: "digest", current_step: "summarize", item_id: "item-1" },
    ],
    recentWorkflows: [
      {
        id: "workflow-complete",
        workflow_type: "completed flow",
        status: "completed",
        created_at: new Date(now.getTime() - 30_000).toISOString(),
      },
      {
        id: "workflow-failed",
        workflow_type: "failed flow",
        status: "failed",
        created_at: new Date(now.getTime() - 120_000).toISOString(),
      },
      {
        id: "workflow-pending",
        workflow_type: "pending flow",
        status: "pending",
        created_at: new Date(now.getTime() - 7_200_000).toISOString(),
      },
      {
        id: "workflow-old",
        workflow_type: "old flow",
        status: "completed",
        created_at: new Date(now.getTime() - 172_800_000).toISOString(),
      },
    ],
    recentActions: [
      {
        id: "action-1",
        action_type: "fallback action",
        tool_name: "web search",
        created_at: new Date(now.getTime() - 30_000).toISOString(),
        reasoning: "needed sources",
      },
      {
        id: "action-2",
        action_type: "fallback action",
        tool_name: null as unknown as string,
        created_at: new Date(now.getTime() - 120_000).toISOString(),
        reasoning: "fallback",
      },
    ],
    pendingApprovals: [
      {
        id: "approval-1",
        action_type: "send_message",
        description: "Confirm this externally visible action",
        created_at: now.toISOString(),
      },
    ],
    stats: {
      dailyCost: 1.23456,
      totalCalls: 12,
      totalTokens: 345,
      jobs: { pending: 1, running: 1, completed: 2, failed: 0 },
    },
  };
}

function jsonResponse(body: unknown): Response {
  return { json: jest.fn().mockResolvedValue(body) } as unknown as Response;
}

async function flushRequestChain() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("AgentStatusPanel", () => {
  let fetchMock: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    jest.useFakeTimers({ now });
    fetchMock = jest.mocked(global.fetch);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it("renders loading, statistics, workflows, actions, approvals, and relative times", async () => {
    fetchMock.mockResolvedValue(jsonResponse(statusFixture()));
    render(<AgentStatusPanel />);

    expect(screen.getByText("Loading agent status...")).toBeInTheDocument();
    expect(await screen.findByText("Agent Activity")).toBeInTheDocument();
    await flushRequestChain();
    expect(screen.getByText("Today: $1.2346")).toBeInTheDocument();
    expect(screen.getByText("12 AI calls")).toBeInTheDocument();
    expect(screen.getByText("digest")).toBeInTheDocument();
    expect(screen.getByText("summarize")).toBeInTheDocument();
    expect(screen.getByText("Approvals Needed")).toBeInTheDocument();
    expect(screen.getByText("web search")).toBeInTheDocument();
    expect(screen.getByText("fallback action")).toBeInTheDocument();
    expect(screen.getAllByText("now").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("2m").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("2h")).toBeInTheDocument();
    expect(screen.getByText("2d")).toBeInTheDocument();
    expect(screen.getAllByText("completed")).toHaveLength(2);
    expect(screen.getByText("failed")).toBeInTheDocument();
    expect(screen.getByText("pending")).toBeInTheDocument();
  });

  it.each(["Approve", "Reject"])("posts an %s decision and refreshes status", async (label) => {
    fetchMock.mockImplementation(async (_input, init) => {
      if (init?.method === "POST") return {} as Response;
      return jsonResponse(statusFixture());
    });
    render(<AgentStatusPanel />);

    const button = await screen.findByRole("button", { name: label });
    await flushRequestChain();
    fireEvent.click(button);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("https://distil.test/api/agent/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          approvalId: "approval-1",
          decision: label === "Approve" ? "approved" : "rejected",
        }),
      });
    });
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(3));
    await flushRequestChain();
  });

  it("keeps existing activity visible while a manual refresh is pending", async () => {
    let resolveRefresh!: (value: Response) => void;
    const refreshRequest = new Promise<Response>((resolve) => {
      resolveRefresh = resolve;
    });
    fetchMock
      .mockResolvedValueOnce(jsonResponse(statusFixture()))
      .mockReturnValueOnce(refreshRequest);
    const { container } = render(<AgentStatusPanel />);
    expect(await screen.findByText("Agent Activity")).toBeInTheDocument();
    await flushRequestChain();

    const refreshButton = container.querySelector(".lucide-refresh-cw")?.closest("button");
    expect(refreshButton).not.toBeNull();
    fireEvent.click(refreshButton!);

    expect(screen.getByText("digest")).toBeInTheDocument();
    expect(screen.queryByText("Loading agent status...")).not.toBeInTheDocument();

    await act(async () => {
      resolveRefresh(jsonResponse(statusFixture()));
      await refreshRequest;
    });
    await flushRequestChain();
  });

  it("polls every fifteen seconds and leaves an empty shell after a failed first request", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    render(<AgentStatusPanel />);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.queryByText("Loading agent status...")).not.toBeInTheDocument();
    expect(screen.getByText("Agent Activity")).toBeInTheDocument();
    const initialCalls = fetchMock.mock.calls.length;

    await act(async () => {
      jest.advanceTimersByTime(15_000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(initialCalls + 1);
  });

  it("limits long recent activity collections", async () => {
    const fixture = statusFixture();
    fixture.pendingApprovals = [];
    fixture.runningWorkflows = [];
    fixture.recentActions = Array.from({ length: 12 }, (_, index) => ({
      id: `action-${index}`,
      action_type: `action ${index}`,
      tool_name: `tool ${index}`,
      created_at: now.toISOString(),
      reasoning: "test",
    }));
    fixture.recentWorkflows = Array.from({ length: 7 }, (_, index) => ({
      id: `workflow-${index}`,
      workflow_type: `flow ${index}`,
      status: "completed",
      created_at: now.toISOString(),
    }));
    fetchMock.mockResolvedValue(jsonResponse(fixture));

    render(<AgentStatusPanel />);

    const actions = await screen.findByText("Recent Actions");
    await flushRequestChain();
    const panel = actions.parentElement?.parentElement;
    expect(panel).not.toBeNull();
    expect(within(panel!).queryByText("tool 9")).toBeInTheDocument();
    expect(within(panel!).queryByText("tool 10")).not.toBeInTheDocument();
    expect(screen.getByText("flow 4")).toBeInTheDocument();
    expect(screen.queryByText("flow 5")).not.toBeInTheDocument();
  });
});
