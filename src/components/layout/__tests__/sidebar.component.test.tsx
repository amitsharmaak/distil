/**
 * @jest-environment jsdom
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { Sidebar } from "../sidebar";
import { ContentCacheProvider } from "@/lib/client-cache/content-cache";

const mockUsePathname = jest.fn<string, []>();

jest.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
  useRouter: () => ({ prefetch: jest.fn() }),
}));

jest.mock("next/image", () => ({
  __esModule: true,
  default: ({ alt, src }: { alt: string; src: string }) => (
    <span role="img" aria-label={alt} data-src={src} />
  ),
}));

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({
    children,
    prefetch,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { prefetch?: boolean }) => (
    <a {...props} data-prefetch={prefetch === false ? "false" : "default"}>
      {children}
    </a>
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

  const renderSidebar = () =>
    render(
      <ContentCacheProvider accountKey="sidebar-test">
        <Sidebar />
      </ContentCacheProvider>
    );

  it("renders the expanded brand and all navigation destinations", () => {
    renderSidebar();

    expect(screen.getByRole("img", { name: "Distil logo" })).toHaveAttribute(
      "data-src",
      "/logo.svg"
    );
    expect(screen.getByText("distil")).toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(5);
    expect(screen.getByRole("link", { name: "Today" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Feed" })).toHaveAttribute("href", "/feed");
    expect(screen.getByRole("link", { name: "Research" })).toHaveAttribute("href", "/research");
    expect(screen.getByRole("link", { name: "Save" })).toHaveAttribute("href", "/save");
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings");
    expect(screen.getByTestId("theme-toggle")).toHaveAttribute("data-collapsed", "false");
  });

  it("keeps legacy and library surfaces out of primary navigation", () => {
    renderSidebar();

    for (const name of [
      "Search",
      "Ask",
      "Digests",
      ["Collec", "tions"].join(""),
      "Archive",
      "Topics",
      "Sources",
    ]) {
      expect(screen.queryByRole("link", { name })).not.toBeInTheDocument();
    }
  });

  it("disables viewport prefetch for every destination", () => {
    renderSidebar();

    for (const name of ["Today", "Feed", "Research", "Save", "Settings"]) {
      expect(screen.getByRole("link", { name })).toHaveAttribute("data-prefetch", "false");
    }
  });

  it("marks only the exact home route active", () => {
    renderSidebar();

    expect(screen.getByRole("link", { name: "Today" })).toHaveClass("bg-sidebar-accent");
    expect(screen.getByRole("link", { name: "Feed" })).not.toHaveClass("bg-sidebar-accent");
  });

  it("marks nested section routes active", () => {
    mockUsePathname.mockReturnValue("/feed/article-1");

    renderSidebar();

    expect(screen.getByRole("link", { name: "Feed" })).toHaveClass("bg-sidebar-accent");
    expect(screen.getByRole("link", { name: "Today" })).not.toHaveClass("bg-sidebar-accent");
  });

  it("collapses and expands while keeping an accessible toggle", () => {
    renderSidebar();

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
