/**
 * @jest-environment jsdom
 */

import { render, screen } from "@testing-library/react";
import { Topbar } from "../topbar";

jest.mock("@/components/layout/theme-toggle", () => ({
  ThemeToggle: ({ collapsed }: { collapsed?: boolean }) => (
    <button type="button" data-testid="theme-toggle" data-collapsed={String(Boolean(collapsed))}>
      Toggle theme
    </button>
  ),
}));

describe("Topbar", () => {
  beforeEach(() => {
    jest.spyOn(Date.prototype, "toLocaleDateString").mockReturnValue("Wednesday, January 15");
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("renders the date, a search link and an icon-only theme toggle", () => {
    render(<Topbar />);

    expect(screen.getByText("Wednesday, January 15")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Search" })).toHaveAttribute("href", "/search");
    expect(screen.getByTestId("theme-toggle")).toHaveAttribute("data-collapsed", "true");
  });

  it("does not render a search input, notification bell or agent controls", () => {
    render(<Topbar />);

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Notifications" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ask Distil" })).not.toBeInTheDocument();
  });

  it("hides the search link when search is disabled by the server", () => {
    render(<Topbar showSearch={false} />);

    expect(screen.queryByRole("link", { name: "Search" })).not.toBeInTheDocument();
    expect(screen.getByTestId("theme-toggle")).toBeInTheDocument();
  });

  it("replaces the date with a back link on reader routes", () => {
    render(<Topbar backHref="/feed" />);

    expect(screen.getByRole("link", { name: "Back to feed" })).toHaveAttribute("href", "/feed");
    expect(screen.queryByText("Wednesday, January 15")).not.toBeInTheDocument();
  });
});
