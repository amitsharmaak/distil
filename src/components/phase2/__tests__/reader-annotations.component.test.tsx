/** @jest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { ReaderAnnotations } from "../reader-annotations";

jest.mock("@/lib/config", () => ({ config: { apiBaseUrl: "https://distil.test" } }));

function response(payload: unknown, ok = true): Response {
  return { ok, json: jest.fn().mockResolvedValue(payload) } as unknown as Response;
}

const baseAnnotation = {
  id: "annotation-1",
  selectedQuote: "An anchored sentence",
  prefix: "",
  suffix: " follows.",
  startOffset: 0,
  endOffset: 20,
  contentHash: "sha256:content",
  contentVersion: "reader-v1:content",
  comment: "Remember this",
  status: "active" as const,
};

describe("ReaderAnnotations", () => {
  let fetchMock: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    fetchMock = jest.mocked(global.fetch);
    fetchMock.mockImplementation((input, init) => {
      const path = String(input);
      if (path.endsWith("/annotations") && !init?.method)
        return Promise.resolve(response({ annotations: [] }));
      if (init?.method === "POST") return Promise.resolve(response({ annotation: baseAnnotation }));
      if (init?.method === "PATCH")
        return Promise.resolve(response({ annotation: baseAnnotation }));
      return Promise.resolve(response({}));
    });
  });

  it("creates an anchored highlight from selected text and supports edit/delete", async () => {
    render(
      <ReaderAnnotations itemId="item-1">
        <p>An anchored sentence follows.</p>
      </ReaderAnnotations>
    );
    await screen.findByText("No highlights yet.");

    const paragraph = screen.getByText("An anchored sentence follows.");
    const textNode = paragraph.firstChild;
    if (!textNode) throw new Error("Expected reader text node");
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, "An anchored sentence".length);
    const browserSelection = window.getSelection();
    browserSelection?.removeAllRanges();
    browserSelection?.addRange(range);
    fireEvent.mouseUp(paragraph);

    expect(await screen.findByRole("dialog", { name: "Save highlight" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save highlight" }));
    expect(await screen.findByText("Highlight saved")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://distil.test/api/v1/items/item-1/annotations",
      expect.objectContaining({ method: "POST" })
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit comment" }));
    const edit = screen.getByRole("textbox", { name: "Comment" });
    fireEvent.change(edit, { target: { value: "Updated" } });
    fireEvent.click(screen.getByRole("button", { name: "Save comment" }));
    expect(await screen.findByText("Highlight updated")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Re-anchor" }));
    browserSelection?.removeAllRanges();
    browserSelection?.addRange(range);
    fireEvent.mouseUp(paragraph);
    expect(await screen.findByRole("button", { name: "Save re-anchor" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save re-anchor" }));
    expect(await screen.findByText("Highlight re-anchored")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(await screen.findByText("Highlight deleted")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://distil.test/api/v1/items/item-1/annotations/annotation-1",
      expect.objectContaining({ method: "DELETE" })
    );
  });

  it("shows loading and load failures", async () => {
    fetchMock.mockReturnValue(new Promise<Response>(() => {}) as Promise<Response>);
    render(
      <ReaderAnnotations itemId="item-1">
        <p>Reader text</p>
      </ReaderAnnotations>
    );
    expect(screen.getByRole("status")).toHaveTextContent("Loading highlights");

    cleanup();
    fetchMock.mockReset();
    fetchMock.mockRejectedValue(new Error("Highlights unavailable"));
    render(
      <ReaderAnnotations itemId="item-2">
        <p>Reader text</p>
      </ReaderAnnotations>
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("Highlights unavailable");
  });

  it("marks stale anchors orphaned and keeps failed edits and deletes visible", async () => {
    fetchMock.mockImplementation((input, init) => {
      if (!init?.method)
        return Promise.resolve(
          response({
            annotations: [
              { ...baseAnnotation, selectedQuote: "Old text", startOffset: 0, endOffset: 8 },
            ],
          })
        );
      if (init.method === "PATCH")
        return Promise.resolve(response({ error: { message: "Edit failed" } }, false));
      return Promise.resolve(response({ error: { message: "Delete failed" } }, false));
    });
    render(
      <ReaderAnnotations itemId="item-1">
        <p>Current reader text</p>
      </ReaderAnnotations>
    );
    expect(await screen.findByText(/no longer matches/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit comment" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Re-anchor" }));
    expect(screen.getByText("Select replacement text above")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Delete failed");
  });

  it("reports a failed anchored highlight save and ignores empty selections", async () => {
    fetchMock.mockImplementation((input, init) => {
      if (!init?.method) return Promise.resolve(response({ annotations: [] }));
      return Promise.resolve(response({ error: { message: "Save failed" } }, false));
    });
    render(
      <ReaderAnnotations itemId="item-1">
        <p>Reader text to select</p>
      </ReaderAnnotations>
    );
    const paragraph = screen.getByText("Reader text to select");
    const textNode = paragraph.firstChild;
    if (!textNode) throw new Error("Expected reader text node");
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, 6);
    const browserSelection = window.getSelection();
    browserSelection?.removeAllRanges();
    browserSelection?.addRange(range);
    fireEvent.mouseUp(paragraph);
    fireEvent.click(await screen.findByRole("button", { name: "Save highlight" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Save failed");

    browserSelection?.removeAllRanges();
    fireEvent.mouseUp(paragraph);
    expect(screen.queryByRole("dialog", { name: "Save highlight" })).toBeInTheDocument();
  });
});
