/**
 * @jest-environment jsdom
 */

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Topbar } from "../topbar";

const mockPush = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock("@/lib/config", () => ({
  config: { apiBaseUrl: "https://distil.test" },
}));

let mockSheetOpen = false;
let mockSetSheetOpen: ((open: boolean) => void) | undefined;

jest.mock("@/components/ui/sheet", () => ({
  Sheet: ({
    children,
    open,
    onOpenChange,
  }: {
    children: React.ReactNode;
    open: boolean;
    onOpenChange: (open: boolean) => void;
  }) => {
    mockSheetOpen = open;
    mockSetSheetOpen = onOpenChange;
    return <>{children}</>;
  },
  SheetTrigger: ({ children }: { children: React.ReactNode }) => (
    <span onClick={() => mockSetSheetOpen?.(true)}>{children}</span>
  ),
  SheetContent: ({ children }: { children: React.ReactNode }) =>
    mockSheetOpen ? <section>{children}</section> : null,
  SheetTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));

let mockPopoverOpen = false;
let mockSetPopoverOpen: ((open: boolean) => void) | undefined;

jest.mock("@/components/ui/popover", () => ({
  Popover: ({
    children,
    open,
    onOpenChange,
  }: {
    children: React.ReactNode;
    open: boolean;
    onOpenChange: (open: boolean) => void;
  }) => {
    mockPopoverOpen = open;
    mockSetPopoverOpen = onOpenChange;
    return <>{children}</>;
  },
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => (
    <span onClick={() => mockSetPopoverOpen?.(true)}>{children}</span>
  ),
  PopoverContent: ({ children }: { children: React.ReactNode }) =>
    mockPopoverOpen ? <section>{children}</section> : null,
}));

jest.mock("@/components/ui/tabs", () => ({
  Tabs: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TabsList: ({ children }: { children: React.ReactNode }) => <div role="tablist">{children}</div>,
  TabsTrigger: ({ children }: { children: React.ReactNode }) => (
    <button type="button" role="tab">
      {children}
    </button>
  ),
  TabsContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock("@/components/notifications/notification-panel", () => ({
  NotificationPanel: ({
    onClose,
    onCountChange,
  }: {
    onClose: () => void;
    onCountChange: (count: number) => void;
  }) => (
    <div data-testid="notification-panel">
      <button onClick={() => onCountChange(7)}>Set unread count</button>
      <button onClick={onClose}>Close notification panel</button>
    </div>
  ),
}));

jest.mock("@/components/agent/chat-panel", () => ({
  ChatPanel: () => <div data-testid="chat-panel">Chat controls</div>,
}));

jest.mock("@/components/agent/agent-status-panel", () => ({
  AgentStatusPanel: () => <div data-testid="agent-status-panel">Activity controls</div>,
}));

function notificationResponse(unreadCount: number): Response {
  return {
    json: jest.fn().mockResolvedValue({ unreadCount }),
  } as unknown as Response;
}

describe("Topbar", () => {
  let fetchMock: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    fetchMock = jest.mocked(global.fetch);
    fetchMock.mockRejectedValue(new Error("notifications unavailable"));
    mockSheetOpen = false;
    mockSetSheetOpen = undefined;
    mockPopoverOpen = false;
    mockSetPopoverOpen = undefined;
    jest.spyOn(Date.prototype, "toLocaleDateString").mockReturnValue("Wednesday, January 15");
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it("renders the date and accessible chat and notification controls", async () => {
    render(<Topbar />);

    expect(screen.getByText("Wednesday, January 15")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ask Distil" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Notifications" })).toBeInTheDocument();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("https://distil.test/api/notifications");
    });
  });

  it("debounces a trimmed search and URL-encodes its query", async () => {
    jest.useFakeTimers();
    render(<Topbar />);

    const input = screen.getByPlaceholderText("Search articles, topics, authors...");
    fireEvent.change(input, { target: { value: "  durable queues  " } });

    expect(mockPush).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(299);
    });
    expect(mockPush).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(mockPush).toHaveBeenCalledWith("/search?q=durable%20queues");
  });

  it("cancels a pending debounce and searches immediately on Enter", () => {
    jest.useFakeTimers();
    render(<Topbar />);

    const input = screen.getByPlaceholderText("Search articles, topics, authors...");
    fireEvent.change(input, { target: { value: "phase one" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith("/search?q=phase%20one");

    act(() => {
      jest.advanceTimersByTime(300);
    });
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it("returns to search for an empty search, Escape, and the clear control", () => {
    render(<Topbar />);

    const input = screen.getByPlaceholderText("Search articles, topics, authors...");

    fireEvent.change(input, { target: { value: "   " } });
    expect(mockPush).toHaveBeenLastCalledWith("/search");

    fireEvent.change(input, { target: { value: "temporary" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input).toHaveValue("");
    expect(mockPush).toHaveBeenLastCalledWith("/search");

    fireEvent.change(input, { target: { value: "clear me" } });
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(input).toHaveValue("");
    expect(mockPush).toHaveBeenLastCalledWith("/search");
  });

  it("submits an empty search on Enter to search", () => {
    render(<Topbar />);

    const input = screen.getByPlaceholderText("Search articles, topics, authors...");
    fireEvent.keyDown(input, { key: "Escape" });
    fireEvent.change(input, { target: { value: "   " } });
    mockPush.mockClear();
    fireEvent.keyDown(input, { key: "Enter" });

    expect(mockPush).toHaveBeenCalledWith("/search");
  });

  it("defaults an omitted unread count to zero", async () => {
    const json = jest.fn().mockResolvedValue({});
    fetchMock.mockResolvedValueOnce({ json } as unknown as Response);

    render(<Topbar />);

    await waitFor(() => {
      expect(json).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByText(/^\d+$/)).not.toBeInTheDocument();
  });

  it("caps a large notification count and accepts count changes from the panel", async () => {
    fetchMock.mockResolvedValueOnce(notificationResponse(123));
    render(<Topbar />);

    expect(await screen.findByText("99+")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Notifications" }));
    fireEvent.click(await screen.findByRole("button", { name: "Set unread count" }));

    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.queryByText("99+")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close notification panel" }));
  });

  it("opens the agent sheet and exposes both chat and activity tabs", async () => {
    render(<Topbar />);

    fireEvent.click(screen.getByRole("button", { name: "Ask Distil" }));

    expect(screen.getByRole("heading", { name: "Distil Agent" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Ask Distil" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Activity" })).toBeInTheDocument();
    expect(screen.getByTestId("chat-panel")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Activity" }));
    expect(screen.getByTestId("agent-status-panel")).toBeInTheDocument();
  });

  it("polls notification counts every thirty seconds and tolerates failures", async () => {
    jest.useFakeTimers();
    render(<Topbar />);

    await act(async () => {
      await Promise.resolve();
    });
    const initialCalls = fetchMock.mock.calls.length;
    expect(initialCalls).toBeGreaterThanOrEqual(1);

    await act(async () => {
      jest.advanceTimersByTime(30000);
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(initialCalls + 1);
    expect(screen.queryByText(/notifications unavailable/i)).not.toBeInTheDocument();
  });
});
