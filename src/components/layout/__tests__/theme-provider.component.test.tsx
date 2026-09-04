/**
 * @jest-environment jsdom
 */

import { act, fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider, useTheme } from "../theme-provider";

function ThemeConsumer() {
  const { theme, toggle } = useTheme();
  return (
    <button type="button" onClick={toggle}>
      Theme: {theme}
    </button>
  );
}

describe("ThemeProvider", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  afterEach(() => {
    jest.restoreAllMocks();
    localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  it("defaults to light and toggles the persisted document theme both ways", () => {
    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>
    );

    const toggle = screen.getByRole("button", { name: "Theme: light" });
    expect(document.documentElement).not.toHaveClass("dark");

    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Theme: dark" })).toBeInTheDocument();
    expect(localStorage.getItem("theme")).toBe("dark");
    expect(document.documentElement).toHaveClass("dark");

    fireEvent.click(screen.getByRole("button", { name: "Theme: dark" }));
    expect(screen.getByRole("button", { name: "Theme: light" })).toBeInTheDocument();
    expect(localStorage.getItem("theme")).toBe("light");
    expect(document.documentElement).not.toHaveClass("dark");
  });

  it("hydrates a persisted dark theme and follows external storage changes", () => {
    localStorage.setItem("theme", "dark");
    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>
    );

    expect(screen.getByRole("button", { name: "Theme: dark" })).toBeInTheDocument();
    expect(document.documentElement).toHaveClass("dark");

    act(() => {
      localStorage.setItem("theme", "light");
      window.dispatchEvent(new StorageEvent("storage", { key: "theme", newValue: "light" }));
    });

    expect(screen.getByRole("button", { name: "Theme: light" })).toBeInTheDocument();
    expect(document.documentElement).not.toHaveClass("dark");
  });

  it("subscribes to and removes both theme event listeners", () => {
    const addSpy = jest.spyOn(window, "addEventListener");
    const removeSpy = jest.spyOn(window, "removeEventListener");

    const { unmount } = render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>
    );

    expect(addSpy).toHaveBeenCalledWith("storage", expect.any(Function));
    expect(addSpy).toHaveBeenCalledWith("distil-theme-change", expect.any(Function));

    unmount();

    expect(removeSpy).toHaveBeenCalledWith("storage", expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith("distil-theme-change", expect.any(Function));
  });
});
