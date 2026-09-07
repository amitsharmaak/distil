/** @jest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";

import { ReaderAnnotations } from "../reader-annotations";

jest.mock("@/lib/config", () => ({ config: { apiBaseUrl: "https://distil.test" } }));

function response(payload: unknown): Response {
  return { ok: true, json: jest.fn().mockResolvedValue(payload) } as unknown as Response;
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
});
