/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";

jest.mock("@/components/capture/token-settings", () => ({
  TokenSettings: () => <div>Capture token management</div>,
}));

import { AccountCenter } from "@/components/account/account-center";

const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>;
const response = (body: unknown, status = 200) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

describe("AccountCenter deletion confirmation", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(
      response({
        account: {
          userId: "11111111-1111-4111-8111-111111111111",
          status: "active",
          displayName: "Amit",
          timezone: "Asia/Kolkata",
          onboardingCompleted: true,
          privacy: { allowPersonalization: true, allowAiProcessing: true },
        },
      })
    );
    fetchMock.mockResolvedValueOnce(response({ sessions: [] }));
    fetchMock.mockResolvedValueOnce(response({ aiAvailable: true }));
  });

  it("requires an explicit typed confirmation before requesting deletion", async () => {
    render(<AccountCenter />);
    const requestButton = await screen.findByRole("button", { name: "Request deletion" });
    fireEvent.click(requestButton);

    const confirmButton = screen.getByRole("button", { name: "Confirm deletion" });
    expect(confirmButton).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(3);

    fireEvent.change(screen.getByLabelText("Type DELETE MY ACCOUNT to confirm"), {
      target: { value: "DELETE MY ACCOUNT" },
    });
    expect(confirmButton).toBeEnabled();

    fetchMock.mockResolvedValueOnce(
      response({ deletion: { id: "delete-1", status: "requested" } }, 202)
    );
    fireEvent.click(confirmButton);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/v1/account/deletion", {
        method: "POST",
        headers: { "content-type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ confirmation: "DELETE MY ACCOUNT" }),
      })
    );
    expect(await screen.findByText(/Deletion status: requested/)).toBeInTheDocument();
  });
});
