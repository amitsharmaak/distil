/** @jest-environment jsdom */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReaderKnowledgePrototype } from "../reader-knowledge-prototype";
import { readerKnowledgeFixture } from "../fixtures";

describe("ReaderKnowledgePrototype", () => {
  it("keeps knowledge controls usable when AI is degraded", () => {
    render(<ReaderKnowledgePrototype fixture={readerKnowledgeFixture} />);
    expect(screen.getByRole("status")).toHaveTextContent(/AI summary is unavailable/);
    expect(screen.getByRole("textbox", { name: "Item note" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Archive item" })).toBeInTheDocument();
  });

  it("supports keyboard-friendly note saving, collection assignment, and archive restore", async () => {
    const user = userEvent.setup();
    render(<ReaderKnowledgePrototype fixture={readerKnowledgeFixture} />);
    const note = screen.getByRole("textbox", { name: "Item note" });
    await user.clear(note);
    await user.type(note, "Decision note");
    await user.click(screen.getByRole("button", { name: /Save note/ }));
    expect(screen.getByText(/Saved locally/)).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "Leadership" }));
    expect(screen.getByRole("checkbox", { name: "Leadership" })).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Archive item" }));
    expect(screen.getByRole("button", { name: "Restore item" })).toBeInTheDocument();
  });

  it("makes saved highlights and comments discoverable", () => {
    render(<ReaderKnowledgePrototype fixture={readerKnowledgeFixture} />);
    expect(screen.getByRole("heading", { name: "Highlights" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Comment" })).toHaveValue(
      "Useful operating principle."
    );
  });
});
