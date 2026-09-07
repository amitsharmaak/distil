/**
 * @jest-environment jsdom
 */

import { fireEvent, render, screen } from "@testing-library/react";

import { ReaderKnowledgeControls } from "../reader-knowledge-controls";

jest.mock("@/lib/config", () => ({ config: { apiBaseUrl: "https://distil.test" } }));

function ok(payload: unknown): Response {
  return { ok: true, json: jest.fn().mockResolvedValue(payload) } as unknown as Response;
}

describe("ReaderKnowledgeControls", () => {
  beforeEach(() => {
    jest.mocked(global.fetch).mockImplementation((url, init) => {
      const path = String(url);
      if (path.endsWith("/state") && !init?.method)
        return Promise.resolve(
          ok({
            state: { isRead: false, archived: false, readingProgress: 0.25, manualPriority: null },
          })
        );
      if (path.endsWith("/note") && !init?.method)
        return Promise.resolve(ok({ note: { body: "Keep this" } }));
      if (path.endsWith("/collections"))
        return Promise.resolve(ok({ collections: [{ id: "product", name: "Product" }] }));
      if (path.endsWith("/collections/product"))
        return Promise.resolve(ok({ collection: { id: "product", name: "Product" }, items: [] }));
      return Promise.resolve(ok({ item: { archivedAt: undefined } }));
    });
  });

  it("loads note, state, and memberships then saves an edited note", async () => {
    render(<ReaderKnowledgeControls itemId="item-1" />);
    const note = await screen.findByLabelText("Item note");
    expect(note).toHaveValue("Keep this");
    expect(screen.getByText("Reading progress: 25%")).toBeInTheDocument();
    fireEvent.change(note, { target: { value: "Updated note" } });
    fireEvent.click(screen.getByRole("button", { name: "Save note" }));
    expect(await screen.findByText("Note saved")).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith(
      "https://distil.test/api/v1/items/item-1/note",
      expect.objectContaining({ method: "PUT" })
    );
  });

  it("rolls back an archive action when the server rejects it", async () => {
    jest.mocked(global.fetch).mockImplementation((url, init) => {
      const path = String(url);
      if (path.endsWith("/state") && init?.method === "PATCH")
        return Promise.resolve({
          ok: false,
          json: jest.fn().mockResolvedValue({ error: { message: "Try again" } }),
        } as unknown as Response);
      if (path.endsWith("/state"))
        return Promise.resolve(
          ok({
            state: { isRead: false, archived: false, readingProgress: 0, manualPriority: null },
          })
        );
      if (path.endsWith("/note")) return Promise.resolve(ok({ note: null }));
      if (path.endsWith("/collections")) return Promise.resolve(ok({ collections: [] }));
      return Promise.resolve(ok({}));
    });
    render(<ReaderKnowledgeControls itemId="item-1" />);
    await screen.findByRole("button", { name: "Archive item" });
    fireEvent.click(screen.getByRole("button", { name: "Archive item" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Try again");
    expect(screen.getByRole("button", { name: "Archive item" })).toBeInTheDocument();
  });

  it("supports restore, unread, priority, and progress controls", async () => {
    jest.mocked(global.fetch).mockImplementation((url, init) => {
      const path = String(url);
      if (path.endsWith("/state") && !init?.method)
        return Promise.resolve(
          ok({
            state: { isRead: true, archived: true, readingProgress: 0.75, manualPriority: "high" },
          })
        );
      if (path.endsWith("/note")) return Promise.resolve(ok({ note: null }));
      if (path.endsWith("/collections/product"))
        return Promise.resolve(ok({ collection: { id: "product", name: "Product" }, items: [] }));
      if (path.endsWith("/collections"))
        return Promise.resolve(ok({ collections: [{ id: "product", name: "Product" }] }));
      if (init?.method === "PATCH") return Promise.resolve(ok({ item: { archivedAt: undefined } }));
      return Promise.resolve(ok({}));
    });
    render(<ReaderKnowledgeControls itemId="item-1" />);
    expect(await screen.findByRole("button", { name: "Restore item" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Restore item" }));
    expect(await screen.findByRole("button", { name: "Archive item" })).toBeInTheDocument();
    await screen.findByText("Item restored");
    fireEvent.click(screen.getByRole("button", { name: "Mark unread" }));
    await screen.findByText("Marked unread");
    fireEvent.change(screen.getByLabelText("Manual priority"), { target: { value: "low" } });
    await screen.findByText("Priority updated");
    fireEvent.click(screen.getByRole("button", { name: "100%" }));
    await screen.findByText("Progress set to 100%");
    expect(global.fetch).toHaveBeenCalledWith(
      "https://distil.test/api/v1/items/item-1/state",
      expect.objectContaining({ method: "PATCH" })
    );
  });

  it("saves and deletes notes, restoring the note when deletion fails", async () => {
    let deleteAttempt = false;
    jest.mocked(global.fetch).mockImplementation((url, init) => {
      const path = String(url);
      if (path.endsWith("/state") && !init?.method)
        return Promise.resolve(
          ok({
            state: { isRead: false, archived: false, readingProgress: 0, manualPriority: null },
          })
        );
      if (path.endsWith("/note") && !init?.method)
        return Promise.resolve(ok({ note: { body: "Keep this" } }));
      if (path.endsWith("/collections")) return Promise.resolve(ok({ collections: [] }));
      if (init?.method === "DELETE" && !deleteAttempt) {
        deleteAttempt = true;
        return Promise.resolve({
          ok: false,
          json: jest.fn().mockResolvedValue({ error: { message: "Cannot delete" } }),
        } as unknown as Response);
      }
      return Promise.resolve(ok({}));
    });
    render(<ReaderKnowledgeControls itemId="item-1" />);
    const note = await screen.findByLabelText("Item note");
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Cannot delete");
    expect(note).toHaveValue("Keep this");
    fireEvent.change(note, { target: { value: "Updated" } });
    fireEvent.click(screen.getByRole("button", { name: "Save note" }));
    expect(await screen.findByText("Note saved")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(await screen.findByText("Note deleted")).toBeInTheDocument();
  });

  it("updates collection membership and rolls back a failed toggle", async () => {
    let putAttempt = true;
    jest.mocked(global.fetch).mockImplementation((url, init) => {
      const path = String(url);
      if (path.endsWith("/state") && !init?.method)
        return Promise.resolve(
          ok({
            state: { isRead: false, archived: false, readingProgress: 0, manualPriority: null },
          })
        );
      if (path.endsWith("/note") && !init?.method) return Promise.resolve(ok({ note: null }));
      if (path.endsWith("/collections/product"))
        return Promise.resolve(ok({ collection: { id: "product", name: "Product" }, items: [] }));
      if (path.endsWith("/collections") && !init?.method)
        return Promise.resolve(ok({ collections: [{ id: "product", name: "Product" }] }));
      if (init?.method === "PUT" && putAttempt) {
        putAttempt = false;
        return Promise.resolve(ok({}));
      }
      if (init?.method === "DELETE")
        return Promise.resolve({
          ok: false,
          json: jest.fn().mockResolvedValue({ error: { message: "Membership failed" } }),
        } as unknown as Response);
      return Promise.resolve(ok({}));
    });
    render(<ReaderKnowledgeControls itemId="item-1" />);
    const checkbox = await screen.findByRole("checkbox", { name: "Product" });
    fireEvent.click(checkbox);
    await screen.findByText("Added to collection");
    fireEvent.click(checkbox);
    expect(await screen.findByRole("alert")).toHaveTextContent("Membership failed");
    expect(checkbox).toBeChecked();
  });

  it("surfaces control load errors", async () => {
    jest.mocked(global.fetch).mockRejectedValue(new Error("Controls unavailable"));
    render(<ReaderKnowledgeControls itemId="item-1" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Controls unavailable");
  });
});
