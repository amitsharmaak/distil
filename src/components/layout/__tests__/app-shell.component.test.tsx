/**
 * @jest-environment jsdom
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { AppShell } from "../app-shell";

jest.mock("next/navigation", () => ({ usePathname: () => "/feed" }));
jest.mock("next/image", () => ({
  __esModule: true,
  default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} />,
}));
jest.mock("@/components/layout/theme-toggle", () => ({
  ThemeToggle: () => <span data-testid="theme-toggle" />,
}));
jest.mock("@/components/layout/topbar", () => ({ Topbar: () => <header>Topbar</header> }));
jest.mock("@/components/layout/mobile-nav", () => ({ MobileNav: () => <nav>Mobile</nav> }));

describe("AppShell", () => {
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
});
