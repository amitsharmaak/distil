/** @jest-environment jsdom */

import { render, screen } from "@testing-library/react";
import { MobileNav } from "../mobile-nav";

jest.mock("next/navigation", () => ({ usePathname: () => "/save" }));

describe("MobileNav", () => {
  it("marks the active page and reserves a full control row above the safe area", () => {
    const { container } = render(<MobileNav />);
    expect(screen.getByRole("link", { name: "Save" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Feed" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Digests" })).toHaveAttribute("href", "/digests");
    expect(screen.getByRole("link", { name: "Search" })).toHaveAttribute("href", "/search");
    expect(screen.getByRole("link", { name: "Ask" })).toHaveAttribute("href", "/ask");
    expect(container.querySelector("nav")).toHaveClass(
      "h-[calc(4rem+env(safe-area-inset-bottom,0px))]"
    );
  });

  it("removes the digest destination when digests are disabled server-side", () => {
    render(<MobileNav showDigests={false} />);
    expect(screen.queryByRole("link", { name: "Digests" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Feed" })).toBeInTheDocument();
  });
});
