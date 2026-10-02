/**
 * @jest-environment jsdom
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { AppShell, isReaderPath } from "../app-shell";
import { ContentCacheProvider } from "@/lib/client-cache/content-cache";

const mockUsePathname = jest.fn<string, []>();

jest.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
  useRouter: () => ({ push: jest.fn(), prefetch: jest.fn() }),
}));
jest.mock("next/image", () => ({
  __esModule: true,
  default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} />,
}));
jest.mock("@/components/layout/theme-toggle", () => ({
  ThemeToggle: () => <span data-testid="theme-toggle" />,
}));
jest.mock("@/components/layout/topbar", () => ({
  Topbar: ({ backHref }: { backHref?: string }) => (
    <header data-back={backHref ?? ""}>Topbar</header>
  ),
}));
jest.mock("@/components/layout/mobile-nav", () => ({ MobileNav: () => <nav>Mobile</nav> }));

describe("AppShell", () => {
  const renderShell = (children: React.ReactNode) =>
    render(
      <ContentCacheProvider accountKey="app-shell-test">
        <AppShell>{children}</AppShell>
      </ContentCacheProvider>
    );

  beforeEach(() => {
    mockUsePathname.mockReturnValue("/feed");
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("keeps the content offset aligned with the sidebar width", () => {
    renderShell(<p>Content</p>);

    const content = screen.getByText("Content").parentElement?.parentElement;
    expect(content).toHaveClass("distil-shell-content");
    expect(content).toHaveAttribute("data-sidebar-collapsed", "false");

    fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));

    expect(content).toHaveAttribute("data-sidebar-collapsed", "true");
  });

  it("shows the mobile tab bar and reserves space for it on list routes", () => {
    renderShell(<p>Content</p>);

    expect(screen.getByText("Mobile")).toBeInTheDocument();
    expect(screen.getByText("Content").parentElement).toHaveClass(
      "pb-[calc(1.5rem+4rem+env(safe-area-inset-bottom,0px))]"
    );
    expect(screen.getByText("Topbar")).toHaveAttribute("data-back", "");
  });

  it("drops the mobile tab bar and routes Back through the top bar on reader pages", () => {
    mockUsePathname.mockReturnValue("/feed/item-42");

    renderShell(<p>Article</p>);

    expect(screen.queryByText("Mobile")).not.toBeInTheDocument();
    expect(screen.getByText("Article").parentElement).not.toHaveClass(
      "pb-[calc(1.5rem+4rem+env(safe-area-inset-bottom,0px))]"
    );
    expect(screen.getByText("Topbar")).toHaveAttribute("data-back", "/feed");
  });

  it("keeps reader navigation quiet until the sidebar shortcut is used", () => {
    mockUsePathname.mockReturnValue("/feed/item-42");
    const { container } = renderShell(<p>Article</p>);
    const shell = container.querySelector(".distil-shell");
    expect(shell).toHaveAttribute("data-reader-navigation", "false");
    fireEvent.keyDown(window, { key: "[" });
    expect(shell).toHaveAttribute("data-reader-navigation", "true");
    fireEvent.keyDown(window, { key: "[" });
    expect(shell).toHaveAttribute("data-reader-navigation", "false");
  });

  it("renders the login route without any shell chrome", () => {
    mockUsePathname.mockReturnValue("/login");

    renderShell(<p>Sign in</p>);

    expect(screen.queryByText("Topbar")).not.toBeInTheDocument();
    expect(screen.queryByText("Mobile")).not.toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Distil logo" })).not.toBeInTheDocument();
  });

  it("renders the public privacy policy without any shell chrome", () => {
    mockUsePathname.mockReturnValue("/privacy");

    render(
      <AppShell>
        <p>Privacy</p>
      </AppShell>
    );

    expect(screen.queryByText("Topbar")).not.toBeInTheDocument();
    expect(screen.queryByText("Mobile")).not.toBeInTheDocument();
  });

  it("recognises only single-item feed routes as reader pages", () => {
    expect(isReaderPath("/feed/abc")).toBe(true);
    expect(isReaderPath("/feed")).toBe(false);
    expect(isReaderPath("/feed/")).toBe(false);
    expect(isReaderPath("/feed/abc/extra")).toBe(false);
  });
});
