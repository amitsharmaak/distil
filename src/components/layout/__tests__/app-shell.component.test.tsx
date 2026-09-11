/**
 * @jest-environment jsdom
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { AppShell, isReaderPath } from "../app-shell";

const mockUsePathname = jest.fn<string, []>();

jest.mock("next/navigation", () => ({ usePathname: () => mockUsePathname() }));
jest.mock("next/image", () => ({
  __esModule: true,
  default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} />,
}));
jest.mock("@/components/layout/theme-toggle", () => ({
  ThemeToggle: () => <span data-testid="theme-toggle" />,
}));
jest.mock("@/components/layout/topbar", () => ({
  Topbar: ({ backHref, showSearch }: { backHref?: string; showSearch?: boolean }) => (
    <header data-back={backHref ?? ""} data-search={String(showSearch)}>
      Topbar
    </header>
  ),
}));
jest.mock("@/components/layout/mobile-nav", () => ({ MobileNav: () => <nav>Mobile</nav> }));

describe("AppShell", () => {
  beforeEach(() => {
    mockUsePathname.mockReturnValue("/feed");
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("keeps the content offset aligned with the sidebar width", () => {
    render(
      <AppShell>
        <p>Content</p>
      </AppShell>
    );

    const content = screen.getByText("Content").parentElement?.parentElement;
    expect(content).toHaveClass("md:pl-64");
    expect(content).not.toHaveClass("md:pl-16");

    fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));

    expect(content).toHaveClass("md:pl-16");
    expect(content).not.toHaveClass("md:pl-64");
  });

  it("shows the mobile tab bar and reserves space for it on list routes", () => {
    render(
      <AppShell showSearch={false}>
        <p>Content</p>
      </AppShell>
    );

    expect(screen.getByText("Mobile")).toBeInTheDocument();
    expect(screen.getByText("Content").parentElement).toHaveClass(
      "pb-[calc(1.5rem+4rem+env(safe-area-inset-bottom,0px))]"
    );
    expect(screen.getByText("Topbar")).toHaveAttribute("data-back", "");
    expect(screen.getByText("Topbar")).toHaveAttribute("data-search", "false");
  });

  it("drops the mobile tab bar and routes Back through the top bar on reader pages", () => {
    mockUsePathname.mockReturnValue("/feed/item-42");

    render(
      <AppShell>
        <p>Article</p>
      </AppShell>
    );

    expect(screen.queryByText("Mobile")).not.toBeInTheDocument();
    expect(screen.getByText("Article").parentElement).not.toHaveClass(
      "pb-[calc(1.5rem+4rem+env(safe-area-inset-bottom,0px))]"
    );
    expect(screen.getByText("Topbar")).toHaveAttribute("data-back", "/feed");
  });

  it("renders the login route without any shell chrome", () => {
    mockUsePathname.mockReturnValue("/login");

    render(
      <AppShell>
        <p>Sign in</p>
      </AppShell>
    );

    expect(screen.queryByText("Topbar")).not.toBeInTheDocument();
    expect(screen.queryByText("Mobile")).not.toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Distil logo" })).not.toBeInTheDocument();
  });

  it("recognises only single-item feed routes as reader pages", () => {
    expect(isReaderPath("/feed/abc")).toBe(true);
    expect(isReaderPath("/feed")).toBe(false);
    expect(isReaderPath("/feed/")).toBe(false);
    expect(isReaderPath("/feed/abc/extra")).toBe(false);
    expect(isReaderPath("/collections/abc")).toBe(false);
  });
});
