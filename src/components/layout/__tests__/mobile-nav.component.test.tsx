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
    expect(container.querySelector("nav")).toHaveClass(
      "h-[calc(4rem+env(safe-area-inset-bottom,0px))]"
    );
  });
});
