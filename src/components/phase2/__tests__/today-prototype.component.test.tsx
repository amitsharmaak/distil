/** @jest-environment jsdom */
import { fireEvent, render as rtlRender, screen, type RenderOptions } from "@testing-library/react";
import type { ReactElement } from "react";
import { ShortcutsProvider } from "@/components/shortcuts/shortcuts-provider";
import { TodayPrototype } from "../today-prototype";
import { todayFixture } from "../fixtures";

jest.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

const render = (ui: ReactElement, options?: RenderOptions) =>
  rtlRender(ui, { wrapper: ShortcutsProvider, ...options });

describe("TodayPrototype", () => {
  it("separates priority reading from resurfacing and explains each choice", () => {
    render(<TodayPrototype {...todayFixture} />);
    expect(screen.getByRole("heading", { name: "Priority Reading" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Worth Revisiting" })).toBeInTheDocument();
    expect(screen.getByText(/Why now: High priority/)).toBeInTheDocument();
    expect(screen.getByText(/opened 21 days ago/)).toBeInTheDocument();
  });

  it("marks each item as a row and does not nest a main landmark", () => {
    const { container } = render(<TodayPrototype {...todayFixture} />);
    expect(container.querySelectorAll("li[data-row][data-item-id]")).toHaveLength(3);
    expect(container.querySelector("main")).toBeNull();
    expect(container.querySelector("li[data-row] a[href]")).toHaveAttribute(
      "href",
      "/feed/priority-1"
    );
  });

  it("j and k walk both sections in one order; r is not registered", () => {
    render(<TodayPrototype {...todayFixture} />);
    const press = (key: string) => fireEvent.keyDown(window, { key });
    const link = (href: string) => document.querySelector(`a[href="${href}"]`);
    press("j");
    expect(link("/feed/priority-1")).toHaveFocus();
    press("j");
    expect(link("/feed/priority-2")).toHaveFocus();
    press("j");
    expect(link("/feed/revisit-1")).toHaveFocus();
    press("k");
    expect(link("/feed/priority-2")).toHaveFocus();
  });

  it("has useful empty states", () => {
    render(<TodayPrototype priority={[]} revisiting={[]} />);
    expect(screen.getByText(/Nothing urgent/)).toBeInTheDocument();
    expect(screen.getByText(/Saved ideas/)).toBeInTheDocument();
  });
});
