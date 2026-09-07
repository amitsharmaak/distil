/**
 * @jest-environment jsdom
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { Sidebar } from "../sidebar";

const mockUsePathname = jest.fn<string, []>();

jest.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
}));

jest.mock("next/image", () => ({
  __esModule: true,
  default: ({ alt, src }: { alt: string; src: string }) => (
    <span role="img" aria-label={alt} data-src={src} />
  ),
}));

jest.mock("@/components/layout/theme-toggle", () => ({
  ThemeToggle: ({ collapsed }: { collapsed?: boolean }) => (
    <span data-testid="theme-toggle" data-collapsed={String(Boolean(collapsed))} />
  ),
}));

describe("Sidebar", () => {
  beforeEach(() => {
    mockUsePathname.mockReturnValue("/");
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("renders the expanded brand and all navigation destinations", () => {
    render(<Sidebar />);

    expect(screen.getByRole("img", { name: "Distil logo" })).toHaveAttribute(
      "data-src",
      "/logo.png"
    );
    expect(screen.getByText("distil")).toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(12);
    expect(screen.getByRole("link", { name: "Today" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Feed" })).toHaveAttribute("href", "/feed");
    expect(screen.getByRole("link", { name: "Digests" })).toHaveAttribute("href", "/digests");
    expect(screen.getByRole("link", { name: "Search" })).toHaveAttribute("href", "/search");
    expect(screen.getByRole("link", { name: "Ask" })).toHaveAttribute("href", "/ask");
    expect(screen.getByRole("link", { name: "Collections" })).toHaveAttribute(
      "href",
      "/collections"
    );
    expect(screen.getByRole("link", { name: "Archive" })).toHaveAttribute("href", "/archive");
    expect(screen.getByRole("link", { name: "Save" })).toHaveAttribute("href", "/save");
    expect(screen.getByRole("link", { name: "Topics" })).toHaveAttribute("href", "/topics");
    expect(screen.getByRole("link", { name: "Sources" })).toHaveAttribute("href", "/sources");
    expect(screen.getByRole("link", { name: "Research" })).toHaveAttribute("href", "/research");
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings");
    expect(screen.getByTestId("theme-toggle")).toHaveAttribute("data-collapsed", "false");
  });

  it("marks only the exact home route active", () => {
    render(<Sidebar />);

    expect(screen.getByRole("link", { name: "Today" })).toHaveClass("bg-sidebar-accent");
    expect(screen.getByRole("link", { name: "Feed" })).not.toHaveClass("bg-sidebar-accent");
  });

  it("marks nested section routes active", () => {
    mockUsePathname.mockReturnValue("/feed/article-1");

    render(<Sidebar />);

    expect(screen.getByRole("link", { name: "Feed" })).toHaveClass("bg-sidebar-accent");
    expect(screen.getByRole("link", { name: "Today" })).not.toHaveClass("bg-sidebar-accent");
  });

  it("removes disabled Phase 2 destinations from navigation", () => {
    render(<Sidebar showDigests={false} showKnowledgeUi={false} />);

    expect(screen.queryByRole("link", { name: "Digests" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Collections" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Archive" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Feed" })).toHaveAttribute("href", "/feed");
  });

  it("collapses and expands while keeping an accessible toggle", () => {
    render(<Sidebar />);

    fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));

    expect(screen.queryByText("distil")).not.toBeInTheDocument();
    expect(screen.queryByText("Today")).not.toBeInTheDocument();
    expect(screen.getByTestId("theme-toggle")).toHaveAttribute("data-collapsed", "true");
    expect(screen.getByRole("button", { name: "Expand sidebar" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Expand sidebar" }));

    expect(screen.getByText("distil")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Today" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Collapse sidebar" })).toBeInTheDocument();
  });
});
