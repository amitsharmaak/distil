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
});
