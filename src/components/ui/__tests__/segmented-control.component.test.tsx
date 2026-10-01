/** @jest-environment jsdom */

import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { SegmentedControl } from "../segmented-control";

function SummaryControl() {
  const [value, setValue] = useState("brief");
  return (
    <SegmentedControl
      aria-label="Summary length"
      value={value}
      onValueChange={setValue}
      options={[
        { value: "brief", label: "Brief" },
        { value: "unavailable", label: "Unavailable", disabled: true },
        { value: "detailed", label: "Detailed" },
      ]}
    />
  );
}

describe("SegmentedControl", () => {
  it("moves focus and selection with arrows, skips disabled options and wraps", () => {
    render(<SummaryControl />);
    const brief = screen.getByRole("radio", { name: "Brief" });
    const detailed = screen.getByRole("radio", { name: "Detailed" });
    expect(screen.getByRole("radiogroup", { name: "Summary length" })).toBeInTheDocument();
    expect(brief).toHaveAttribute("aria-checked", "true");
    expect(brief).toHaveAttribute("tabindex", "0");
    expect(detailed).toHaveAttribute("tabindex", "-1");

    brief.focus();
    fireEvent.keyDown(brief, { key: "ArrowRight" });
    expect(detailed).toHaveFocus();
    expect(detailed).toHaveAttribute("aria-checked", "true");
    expect(detailed).toHaveAttribute("tabindex", "0");
    expect(brief).toHaveAttribute("tabindex", "-1");

    fireEvent.keyDown(detailed, { key: "ArrowRight" });
    expect(brief).toHaveFocus();
    expect(brief).toHaveAttribute("aria-checked", "true");
    fireEvent.keyDown(brief, { key: "ArrowLeft" });
    expect(detailed).toHaveFocus();
  });

  it("supports pointer, Home and End selection without activating disabled options", () => {
    render(<SummaryControl />);
    const brief = screen.getByRole("radio", { name: "Brief" });
    const detailed = screen.getByRole("radio", { name: "Detailed" });

    fireEvent.click(detailed);
    expect(detailed).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("radio", { name: "Unavailable" }));
    expect(detailed).toHaveAttribute("aria-checked", "true");

    fireEvent.keyDown(detailed, { key: "Home" });
    expect(brief).toHaveFocus();
    fireEvent.keyDown(brief, { key: "End" });
    expect(detailed).toHaveFocus();
  });
});
