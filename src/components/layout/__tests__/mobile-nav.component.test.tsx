/** @jest-environment jsdom */

import { render, screen } from "@testing-library/react";
import { MobileNav } from "../mobile-nav";

jest.mock("next/navigation", () => ({ usePathname: () => "/save" }));

describe("MobileNav", () => {
  it("renders the four primary destinations and marks the active page", () => {
    const { container } = render(<MobileNav />);

    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/",
      "/feed",
      "/save",
      "/settings",
    ]);
    expect(screen.getByRole("link", { name: "Save" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Feed" })).not.toHaveAttribute("aria-current");
    expect(container.querySelector("nav")).toHaveClass(
      "h-[calc(4rem+env(safe-area-inset-bottom,0px))]"
    );
  });

  it("does not expose secondary destinations on the phone bar", () => {
    render(<MobileNav />);

    for (const name of ["Digests", "Search", "Ask", "Research", "Topics", "Sources"]) {
      expect(screen.queryByRole("link", { name })).not.toBeInTheDocument();
    }
  });
});
