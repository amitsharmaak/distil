/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TokenSettings } from "@/components/capture/token-settings";

const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>;
const response = (body: unknown, status: number) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

describe("TokenSettings", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    Object.assign(navigator, { clipboard: { writeText: jest.fn() } });
  });

  it("lists, creates, copies, and revokes independently named tokens", async () => {
    const summary = {
      id: "token-1",
      name: "iPhone",
      tokenPrefix: "dst_cap_abcdefgh",
      createdAt: "2026-03-01T00:00:00Z",
    };
    fetchMock
      .mockResolvedValueOnce(response({ tokens: [summary] }, 200))
      .mockResolvedValueOnce(
        response(
          {
            token: { ...summary, id: "token-2", name: "Extension", token: "dst_cap_secret" },
          },
          201
        )
      )
      .mockResolvedValueOnce(response({ tokens: [summary] }, 200))
      .mockResolvedValueOnce(response(undefined, 204));
    render(<TokenSettings />);
    await screen.findByText("iPhone");
    fireEvent.change(screen.getByLabelText("Token name"), { target: { value: "Extension" } });
    fireEvent.click(screen.getByRole("button", { name: "Create token" }));
    await screen.findByText("dst_cap_secret");
    fireEvent.click(screen.getByRole("button", { name: "Copy token" }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("dst_cap_secret");
    fireEvent.click(screen.getByRole("button", { name: "Revoke iPhone" }));
    await waitFor(() => expect(screen.queryByText("iPhone")).not.toBeInTheDocument());
  });
});
