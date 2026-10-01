/**
 * @jest-environment jsdom
 */

import { act, fireEvent, screen, waitFor } from "@testing-library/react";

import { ReaderKnowledgeControls } from "../reader-knowledge-controls";
import { renderWithContentCache as render } from "../../../../tests/support/content-cache";

function ok(payload: unknown): Response {
  return { ok: true, json: jest.fn().mockResolvedValue(payload) } as unknown as Response;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((fulfill) => {
    resolve = fulfill;
  });
  return { promise, resolve };
}

describe("ReaderKnowledgeControls", () => {
  beforeEach(() => {
    jest.mocked(global.fetch).mockReset();
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
      if (path.endsWith("/note") && init?.method === "PUT")
        return Promise.resolve(
          ok({ note: { body: JSON.parse(String(init.body)).body as string } })
        );
      return Promise.resolve(ok({ item: { archivedAt: undefined } }));
    });
  });

  it("uses server-loaded state and note without mount requests", async () => {
    render(
      <ReaderKnowledgeControls
        itemId="item-1"
        initial={{
          state: {
            isRead: true,
            archived: true,
            readingProgress: 0.75,
            manualPriority: "high",
          },
          note: { body: "Loaded with the reader" },
        }}
      />
    );

    expect(await screen.findByLabelText("Item note")).toHaveValue("Loaded with the reader");
    expect(screen.getByRole("button", { name: "Restore item" })).toBeInTheDocument();
    expect(screen.getByLabelText("Manual priority")).toHaveValue("high");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("loads note and state then saves an edited note", async () => {
    render(<ReaderKnowledgeControls itemId="item-1" />);
    const note = await screen.findByLabelText("Item note");
    expect(note).toHaveValue("Keep this");
    expect(screen.queryByText(/Reading progress/)).not.toBeInTheDocument();
    fireEvent.change(note, { target: { value: "Updated note" } });
    fireEvent.click(screen.getByRole("button", { name: "Save note" }));
    expect(await screen.findByText("Note saved")).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/v1/items/item-1/note",
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
      return Promise.resolve(ok({}));
    });
    render(<ReaderKnowledgeControls itemId="item-1" />);
    await screen.findByRole("button", { name: "Archive item" });
    fireEvent.click(screen.getByRole("button", { name: "Archive item" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not save this change");
    expect(screen.getByRole("button", { name: "Archive item" })).toBeInTheDocument();
  });

  it("supports restore, unread, priority, and progress controls", async () => {
    let serverState = {
      isRead: true,
      archived: true,
      readingProgress: 0.75,
      manualPriority: "high" as string | null,
    };
    jest.mocked(global.fetch).mockImplementation((url, init) => {
      const path = String(url);
      if (path.endsWith("/state") && !init?.method)
        return Promise.resolve(ok({ state: serverState }));
      if (path.endsWith("/note")) return Promise.resolve(ok({ note: null }));
      if (path.endsWith("/state") && init?.method === "PATCH") {
        serverState = { ...serverState, ...JSON.parse(String(init.body)) };
        return Promise.resolve(ok({ item: { archivedAt: undefined } }));
      }
      if (init?.method === "PUT")
        return Promise.resolve(
          ok({ note: { body: JSON.parse(String(init.body)).body as string } })
        );
      return Promise.resolve(ok({}));
    });
    render(<ReaderKnowledgeControls itemId="item-1" />);
    expect(await screen.findByRole("button", { name: "Restore item" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Restore item" }));
    expect(await screen.findByRole("button", { name: "Archive item" })).toBeInTheDocument();
    await screen.findByText("Item restored");
    expect(screen.queryByRole("button", { name: /Mark (un)?read/ })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Manual priority"), { target: { value: "low" } });
    await screen.findByText("Priority updated");
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/v1/items/item-1/state",
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
      if (init?.method === "DELETE" && !deleteAttempt) {
        deleteAttempt = true;
        return Promise.resolve({
          ok: false,
          json: jest.fn().mockResolvedValue({ error: { message: "Cannot delete" } }),
        } as unknown as Response);
      }
      if (init?.method === "PUT")
        return Promise.resolve(
          ok({ note: { body: JSON.parse(String(init.body)).body as string } })
        );
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

  it("surfaces control load errors", async () => {
    jest.mocked(global.fetch).mockRejectedValue(new Error("Controls unavailable"));
    render(<ReaderKnowledgeControls itemId="item-1" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Controls unavailable");
  });

  it("keeps cached note and state mutations when old server props remount", async () => {
    jest.mocked(global.fetch).mockImplementation((url, init) => {
      const path = String(url);
      if (path.endsWith("/note") && init?.method === "PUT")
        return Promise.resolve(ok({ note: { body: "Updated locally" } }));
      if (path.endsWith("/state") && init?.method === "PATCH") return Promise.resolve(ok({}));
      if (path.endsWith("/state"))
        return Promise.resolve(
          ok({
            state: { isRead: false, archived: true, readingProgress: 0, manualPriority: null },
          })
        );
      return Promise.resolve(ok({ note: { body: "Old server note" } }));
    });
    const oldInitial = {
      state: {
        isRead: false,
        archived: false,
        readingProgress: 0,
        manualPriority: null,
      },
      note: { body: "Old server note" },
      updatedAt: Date.now(),
    };
    const view = render(<ReaderKnowledgeControls itemId="item-1" initial={oldInitial} />);
    const note = await screen.findByLabelText("Item note");
    fireEvent.change(note, { target: { value: "Updated locally" } });
    fireEvent.click(screen.getByRole("button", { name: "Save note" }));
    expect(await screen.findByText("Note saved")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Archive item" }));
    expect(await screen.findByRole("button", { name: "Restore item" })).toBeInTheDocument();

    view.rerender(<div>Elsewhere</div>);
    view.rerender(<ReaderKnowledgeControls itemId="item-1" initial={oldInitial} />);

    expect(await screen.findByLabelText("Item note")).toHaveValue("Updated locally");
    expect(screen.getByRole("button", { name: "Restore item" })).toBeInTheDocument();
  });

  it("waits for an in-flight stale note read before saving", async () => {
    const staleNote = deferred<Response>();
    jest.mocked(global.fetch).mockImplementation((url, init) => {
      const path = String(url);
      if (path.endsWith("/state") && !init?.method)
        return Promise.resolve(
          ok({
            state: { isRead: false, archived: false, readingProgress: 0, manualPriority: null },
          })
        );
      if (path.endsWith("/note") && !init?.method) return staleNote.promise;
      if (path.endsWith("/note") && init?.method === "PUT")
        return Promise.resolve(ok({ note: { body: "Saved after refresh" } }));
      return Promise.resolve(ok({}));
    });

    render(
      <ReaderKnowledgeControls
        itemId="item-1"
        initial={{
          state: { isRead: false, archived: false, readingProgress: 0, manualPriority: null },
          note: { body: "Older note" },
          updatedAt: 1,
        }}
      />
    );
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/v1/items/item-1/note",
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      )
    );

    fireEvent.change(screen.getByLabelText("Item note"), {
      target: { value: "Saved after refresh" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save note" }));
    expect(global.fetch).not.toHaveBeenCalledWith(
      "/api/v1/items/item-1/note",
      expect.objectContaining({ method: "PUT" })
    );

    await act(async () => {
      staleNote.resolve(ok({ note: { body: "Stale background note" } }));
      await staleNote.promise;
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(await screen.findByText("Note saved")).toBeInTheDocument();
    expect(screen.getByLabelText("Item note")).toHaveValue("Saved after refresh");
  });

  it("does not let an in-flight stale note read resurrect a deletion", async () => {
    const staleNote = deferred<Response>();
    jest.mocked(global.fetch).mockImplementation((url, init) => {
      const path = String(url);
      if (path.endsWith("/state") && !init?.method)
        return Promise.resolve(
          ok({
            state: { isRead: false, archived: false, readingProgress: 0, manualPriority: null },
          })
        );
      if (path.endsWith("/note") && !init?.method) return staleNote.promise;
      return Promise.resolve(ok({}));
    });

    render(
      <ReaderKnowledgeControls
        itemId="item-1"
        initial={{
          state: { isRead: false, archived: false, readingProgress: 0, manualPriority: null },
          note: { body: "Delete me" },
          updatedAt: 1,
        }}
      />
    );
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/v1/items/item-1/note",
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      )
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(global.fetch).not.toHaveBeenCalledWith(
      "/api/v1/items/item-1/note",
      expect.objectContaining({ method: "DELETE" })
    );

    await act(async () => {
      staleNote.resolve(ok({ note: { body: "Stale background note" } }));
      await staleNote.promise;
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(await screen.findByText("Note deleted")).toBeInTheDocument();
    expect(screen.getByLabelText("Item note")).toHaveValue("");
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });
});
