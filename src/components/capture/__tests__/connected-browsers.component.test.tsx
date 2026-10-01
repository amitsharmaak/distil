/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { ConnectedBrowsers } from "@/components/capture/connected-browsers";

const fetchMock = jest.mocked(global.fetch);
const response = (status: number, body: unknown = {}) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

beforeEach(() => fetchMock.mockReset());

it("shows an empty state when no browser is connected", async () => {
  fetchMock.mockResolvedValue(response(200, { connections: [] }));
  render(<ConnectedBrowsers />);
  expect(await screen.findByText("No browsers connected yet.")).toBeInTheDocument();
});

it("lists connections with their dates and disconnects one", async () => {
  fetchMock
    .mockResolvedValueOnce(
      response(200, {
        connections: [
          { id: "c1", label: "Chrome on macOS", createdAt: "2026-09-30T00:00:00Z" },
          {
            id: "c2",
            label: "Chrome on Windows",
            createdAt: "2026-09-01T00:00:00Z",
            lastUsedAt: "2026-09-29T00:00:00Z",
          },
        ],
      })
    )
    .mockResolvedValueOnce(response(204))
    .mockResolvedValueOnce(
      response(200, {
        connections: [{ id: "c2", label: "Chrome on Windows", createdAt: "2026-09-01T00:00:00Z" }],
      })
    );
  render(<ConnectedBrowsers />);

  expect(await screen.findByText("Chrome on macOS")).toBeInTheDocument();
  expect(screen.getByText(/Not used yet/)).toBeInTheDocument();
  expect(screen.getByText(/Last used/)).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Disconnect Chrome on macOS" }));

  await waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/extension/connections/c1",
      expect.objectContaining({ method: "DELETE" })
    )
  );
  await waitFor(() => expect(screen.queryByText("Chrome on macOS")).not.toBeInTheDocument());
  expect(screen.getByText("Chrome on Windows")).toBeInTheDocument();
});

it("reports a load failure", async () => {
  fetchMock.mockResolvedValue(response(500));
  render(<ConnectedBrowsers />);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Could not load your connected browsers."
  );
});

it("reports a failed disconnect and keeps the list", async () => {
  fetchMock
    .mockResolvedValueOnce(
      response(200, {
        connections: [{ id: "c1", label: "Chrome on macOS", createdAt: "2026-09-30T00:00:00Z" }],
      })
    )
    .mockResolvedValueOnce(response(500));
  render(<ConnectedBrowsers />);
  fireEvent.click(await screen.findByRole("button", { name: "Disconnect Chrome on macOS" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not disconnect.");
  expect(screen.getByText("Chrome on macOS")).toBeInTheDocument();
});
