/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";

jest.mock("@/components/capture/token-settings", () => ({
  TokenSettings: () => <div>Capture token management</div>,
}));

import { AccountCenter } from "@/components/account/account-center";

const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>;
const response = (body: unknown, status = 200) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;
const account = {
  userId: "11111111-1111-4111-8111-111111111111",
  status: "active",
  displayName: "Amit",
  timezone: "Asia/Kolkata",
  onboardingCompleted: true,
  privacy: { allowPersonalization: true, allowAiProcessing: true },
};

function mockActiveHydration(exports: unknown[] = []) {
  fetchMock.mockResolvedValueOnce(response({ account: { status: "active" }, deletion: null }));
  fetchMock.mockResolvedValueOnce(response({ account }));
  fetchMock.mockResolvedValueOnce(response({ sessions: [] }));
  fetchMock.mockResolvedValueOnce(response({ aiAvailable: true }));
  fetchMock.mockResolvedValueOnce(response({ exports }));
}

describe("AccountCenter lifecycle recovery", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("requires an explicit typed confirmation before requesting deletion", async () => {
    mockActiveHydration();
    render(<AccountCenter />);
    const requestButton = await screen.findByRole("button", { name: "Request deletion" });
    fireEvent.click(requestButton);

    const confirmButton = screen.getByRole("button", { name: "Confirm deletion" });
    expect(confirmButton).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(5);

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

  it("turns a typed fresh-auth failure into an explicit invite-only recovery state", async () => {
    mockActiveHydration();
    render(<AccountCenter />);
    const exportButton = await screen.findByRole("button", { name: "Request export" });
    fetchMock.mockResolvedValueOnce(
      response(
        {
          error: {
            code: "FRESH_AUTH_REQUIRED",
            message: "Recent authentication is required for this account action",
            recovery: { kind: "CONTACT_OPERATOR_FOR_NEW_INVITATION" },
          },
        },
        403
      )
    );

    fireEvent.click(exportButton);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This invite-only build cannot safely renew authentication in place"
    );
    expect(screen.getByRole("button", { name: "Retry action" })).toBeInTheDocument();

    fetchMock.mockResolvedValueOnce(
      response({ export: { id: "export-1", status: "queued", requestedAt: "2026-09-08" } }, 202)
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry action" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenLastCalledWith("/api/v1/account/export", {
        method: "POST",
        headers: { "idempotency-key": expect.any(String) },
      })
    );
    expect(await screen.findByText("queued")).toBeInTheDocument();
  });

  it("hydrates pending exports after a page refresh", async () => {
    mockActiveHydration([
      {
        id: "55555555-5555-4555-8555-555555555555",
        status: "running",
        requestedAt: "2026-09-08T00:00:00.000Z",
      },
    ]);
    render(<AccountCenter />);

    expect(await screen.findByText("running")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh status" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/account/exports", {
      headers: { Accept: "application/json" },
    });
  });

  it("keeps the account page usable while lifecycle flags remain disabled", async () => {
    fetchMock.mockResolvedValueOnce(response({ error: { code: "NOT_FOUND" } }, 404));
    fetchMock.mockResolvedValueOnce(response({ account }));
    fetchMock.mockResolvedValueOnce(response({ sessions: [] }));
    fetchMock.mockResolvedValueOnce(response({ aiAvailable: true }));
    fetchMock.mockResolvedValueOnce(response({ error: { code: "NOT_FOUND" } }, 404));
    render(<AccountCenter />);

    expect(await screen.findByText("Profile and privacy")).toBeInTheDocument();
    expect(screen.queryByText("Could not load your exports.")).not.toBeInTheDocument();
  });

  it("renders deletion_pending as status/cancel-only and recovers after cancellation", async () => {
    fetchMock.mockResolvedValueOnce(
      response({
        account: { status: "deletion_pending" },
        deletion: {
          id: "44444444-4444-4444-8444-444444444444",
          status: "requested",
          purgeAfter: "2026-09-15T00:00:00.000Z",
        },
      })
    );
    render(<AccountCenter />);

    expect(await screen.findByText("Account deletion in progress")).toBeInTheDocument();
    expect(screen.getByText(/Deletion status: requested/)).toBeInTheDocument();
    expect(screen.queryByText("Profile and privacy")).not.toBeInTheDocument();
    expect(screen.queryByText("Capture token management")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Request export" })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockResolvedValueOnce(
      response({ deletion: { id: "44444444-4444-4444-8444-444444444444", status: "cancelled" } })
    );
    mockActiveHydration();
    fireEvent.click(screen.getByRole("button", { name: "Cancel deletion" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/v1/account/deletion", { method: "DELETE" })
    );
    expect(await screen.findByText("Profile and privacy")).toBeInTheDocument();
    expect(screen.getByText("Account deletion has been cancelled.")).toBeInTheDocument();
  });
});
