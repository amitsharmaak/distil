/**
 * @jest-environment jsdom
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { ThemeToggle } from "../theme-toggle";

const mockToggle = jest.fn();
const mockUseTheme = jest.fn();

jest.mock("../theme-provider", () => ({
  useTheme: () => mockUseTheme(),
}));

describe("ThemeToggle", () => {
  beforeEach(() => {
    mockUseTheme.mockReturnValue({ theme: "light", toggle: mockToggle });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("offers dark mode while the light theme is active", () => {
    const { container } = render(<ThemeToggle />);

    expect(screen.getByRole("button", { name: "Toggle theme" })).toHaveTextContent("Dark mode");
    expect(container.querySelector(".lucide-moon")).toBeInTheDocument();
  });

  it("offers light mode while the dark theme is active", () => {
    mockUseTheme.mockReturnValue({ theme: "dark", toggle: mockToggle });

    const { container } = render(<ThemeToggle />);

    expect(screen.getByRole("button", { name: "Toggle theme" })).toHaveTextContent("Light mode");
    expect(container.querySelector(".lucide-sun")).toBeInTheDocument();
  });

  it("keeps an accessible name when collapsed and invokes the provider toggle", () => {
    render(<ThemeToggle collapsed />);

    const button = screen.getByRole("button", { name: "Toggle theme" });
    expect(button).not.toHaveTextContent("Dark mode");

    fireEvent.click(button);

    expect(mockToggle).toHaveBeenCalledTimes(1);
  });
});
