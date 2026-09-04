/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CaptureForm } from "@/components/capture/capture-form";

const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>;
const response = (body: unknown, status: number) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

describe("CaptureForm", () => {
  beforeEach(() => fetchMock.mockReset());

  it("submits a same-origin web capture and renders its receipt", async () => {
    fetchMock.mockResolvedValueOnce(
      response(
        {
          receipt: {
            id: "capture-1",
            normalizedUrl: "https://example.com/article",
            status: "ready",
            itemId: "item-1",
            retryable: false,
            attempts: 1,
            createdAt: "2026-03-01T00:00:00Z",
            updatedAt: "2026-03-01T00:00:01Z",
          },
          duplicate: false,
        },
        202
      )
    );
    render(<CaptureForm />);

    fireEvent.change(screen.getByLabelText("Article URL"), {
      target: { value: "https://example.com/article" },
    });
    fireEvent.change(screen.getByLabelText(/Title/), { target: { value: "  Worth reading  " } });
    fireEvent.click(screen.getByRole("button", { name: "Save to Distil" }));

    await screen.findByRole("link", { name: "Read article" });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/captures",
      expect.objectContaining({ method: "POST" })
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual(
      expect.objectContaining({ source: "web", title: "Worth reading" })
    );
  });

  it("shows an API error without claiming the article was saved", async () => {
    fetchMock.mockResolvedValueOnce(response({ error: { message: "That URL is not safe." } }, 422));
    render(<CaptureForm />);
    fireEvent.change(screen.getByLabelText("Article URL"), {
      target: { value: "http://localhost/private" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Save to Distil" }).closest("form")!);
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("That URL is not safe.")
    );
    expect(screen.queryByText("Ready")).not.toBeInTheDocument();
  });
});
