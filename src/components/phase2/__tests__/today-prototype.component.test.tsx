/** @jest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { TodayPrototype } from "../today-prototype";
import { todayFixture } from "../fixtures";

describe("TodayPrototype", () => {
  it("separates priority reading from resurfacing and explains each choice", () => {
    render(<TodayPrototype {...todayFixture} />);
    expect(screen.getByRole("heading", { name: "Priority Reading" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Worth Revisiting" })).toBeInTheDocument();
    expect(screen.getByText(/Why now: High priority/)).toBeInTheDocument();
    expect(screen.getByText(/opened 21 days ago/)).toBeInTheDocument();
  });

  it("has useful empty states", () => {
    render(<TodayPrototype priority={[]} revisiting={[]} />);
    expect(screen.getByText(/Nothing urgent/)).toBeInTheDocument();
    expect(screen.getByText(/Saved ideas/)).toBeInTheDocument();
  });
});
