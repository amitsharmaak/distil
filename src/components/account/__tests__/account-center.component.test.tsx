/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";

jest.mock("@/components/capture/token-settings", () => ({
  TokenSettings: () => <div>Capture token management</div>,
}));

import { AccountCenter } from "@/components/account/account-center";

const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>;
const response = (body: unknown, status = 200) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;
const invalidJsonResponse = (status: number) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => Promise.reject(new Error()),
  }) as unknown as Response;
const account = {
  userId: "11111111-1111-4111-8111-111111111111",
  status: "active",
  displayName: "Amit",
  timezone: "Asia/Kolkata",
  onboardingCompleted: true,
  privacy: { allowPersonalization: true, allowAiProcessing: true },
};
const currentSession = {
  id: "current session",
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-08T00:00:00.000Z",
  expiresAt: "2026-10-01T00:00:00.000Z",
  current: true,
};
const otherSession = {
  ...currentSession,
  id: "other/session",
  current: false,
  userAgent: "Other browser",
};

function mockActiveHydration(
  input: {
    exports?: unknown[];
    sessions?: unknown[];
    usage?: { aiAvailable?: boolean };
    deletion?: unknown;
  } = {}
) {
  fetchMock.mockResolvedValueOnce(
    response({ account: { status: "active" }, deletion: input.deletion ?? null })
  );
  fetchMock.mockResolvedValueOnce(response({ account }));
  fetchMock.mockResolvedValueOnce(response({ sessions: input.sessions ?? [] }));
  fetchMock.mockResolvedValueOnce(response(input.usage ?? { aiAvailable: true }));
  fetchMock.mockResolvedValueOnce(response({ exports: input.exports ?? [] }));
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

  it("shows non-recoverable export errors plainly and deduplicates a later request", async () => {
    const existing = {
      id: "55555555-5555-4555-8555-555555555555",
      status: "failed",
      requestedAt: "2026-09-08T00:00:00.000Z",
    };
    mockActiveHydration({ exports: [existing] });
    render(<AccountCenter />);
    expect(await screen.findByText("failed")).toBeInTheDocument();

    fetchMock.mockResolvedValueOnce(
      response({ error: { code: "QUOTA_EXCEEDED", message: "Export quota exhausted" } }, 429)
    );
    fireEvent.click(screen.getByRole("button", { name: "Request export" }));
    expect(await screen.findByText("Export quota exhausted")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry action" })).not.toBeInTheDocument();

    fetchMock.mockResolvedValueOnce(response({ export: { ...existing, status: "queued" } }, 202));
    fireEvent.click(screen.getByRole("button", { name: "Request export" }));
    expect(await screen.findByText("queued")).toBeInTheDocument();
    expect(screen.queryByText("failed")).not.toBeInTheDocument();
    expect(screen.getAllByText("queued")).toHaveLength(1);
  });

  it("hydrates pending exports after a page refresh", async () => {
    mockActiveHydration({
      exports: [
        {
          id: "55555555-5555-4555-8555-555555555555",
          status: "running",
          requestedAt: "2026-09-08T00:00:00.000Z",
        },
      ],
    });
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

  it("shows deletion-status and profile hydration errors without loading broader data", async () => {
    fetchMock.mockResolvedValueOnce(
      response({ error: { message: "Deletion status is unavailable" } }, 503)
    );
    const { unmount } = render(<AccountCenter />);

    expect(await screen.findByText("Deletion status is unavailable")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    unmount();

    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(response({ error: { code: "NOT_FOUND" } }, 404));
    fetchMock.mockResolvedValueOnce(invalidJsonResponse(503));
    render(<AccountCenter />);

    expect(await screen.findByText("Could not load your account.")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("surfaces export hydration failures but tolerates unavailable session and usage data", async () => {
    fetchMock.mockResolvedValueOnce(response({ account: { status: "active" }, deletion: null }));
    fetchMock.mockResolvedValueOnce(response({ account }));
    fetchMock.mockResolvedValueOnce(response({ error: { message: "No sessions" } }, 503));
    fetchMock.mockResolvedValueOnce(response({ error: { message: "No usage" } }, 503));
    fetchMock.mockResolvedValueOnce(
      response({ error: { message: "Export history is unavailable" } }, 503)
    );
    render(<AccountCenter />);

    expect(await screen.findByText("Export history is unavailable")).toBeInTheDocument();
    expect(screen.getByText(/No provider sessions are available/)).toBeInTheDocument();
    expect(screen.getByText("Your usage limits are calculated per account.")).toBeInTheDocument();
  });

  it("renders current and remote sessions, ready downloads, and exhausted AI usage", async () => {
    const readyExport = {
      id: "55555555-5555-4555-8555-555555555555",
      status: "ready",
      requestedAt: "2026-09-08T00:00:00.000Z",
    };
    mockActiveHydration({
      sessions: [
        currentSession,
        otherSession,
        { ...otherSession, id: "unknown", userAgent: undefined },
      ],
      exports: [readyExport],
      usage: { aiAvailable: false },
    });
    render(<AccountCenter />);

    expect(await screen.findByText("This device")).toBeInTheDocument();
    expect(screen.getByText("Other browser")).toBeInTheDocument();
    expect(screen.getByText("Unknown device")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Download" })).toHaveAttribute(
      "href",
      `/api/v1/account/exports/${readyExport.id}/download`
    );
    expect(screen.getByText(/AI usage is currently unavailable/)).toBeInTheDocument();
  });

  it("revokes one encoded remote session and keeps the current session", async () => {
    mockActiveHydration({ sessions: [currentSession, otherSession] });
    render(<AccountCenter />);
    expect(await screen.findByText("Other browser")).toBeInTheDocument();

    fetchMock.mockResolvedValueOnce(response(null, 204));
    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/v1/account/sessions/other%2Fsession", {
        method: "DELETE",
      })
    );
    await waitFor(() => expect(screen.queryByText("Other browser")).not.toBeInTheDocument());
    expect(screen.getByText("This device")).toBeInTheDocument();
  });

  it("preserves a remote session when revocation fails with a non-JSON response", async () => {
    mockActiveHydration({ sessions: [currentSession, otherSession] });
    render(<AccountCenter />);
    expect(await screen.findByText("Other browser")).toBeInTheDocument();

    fetchMock.mockResolvedValueOnce(invalidJsonResponse(503));
    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));

    expect(
      await screen.findByText("Could not revoke that session. Please authenticate again.")
    ).toBeInTheDocument();
    expect(screen.getByText("Other browser")).toBeInTheDocument();
  });

  it("revokes all remote sessions or reports the provider error", async () => {
    mockActiveHydration({ sessions: [currentSession, otherSession] });
    const { unmount } = render(<AccountCenter />);
    expect(await screen.findByText("Other browser")).toBeInTheDocument();

    fetchMock.mockResolvedValueOnce(response({ revoked: true }));
    fireEvent.click(screen.getByRole("button", { name: "Revoke other sessions" }));
    expect(await screen.findByText("Other sessions have been revoked.")).toBeInTheDocument();
    expect(screen.queryByText("Other browser")).not.toBeInTheDocument();
    unmount();

    fetchMock.mockReset();
    mockActiveHydration({ sessions: [currentSession, otherSession] });
    render(<AccountCenter />);
    expect(await screen.findByText("Other browser")).toBeInTheDocument();
    fetchMock.mockResolvedValueOnce(
      response({ error: { message: "Provider rejected revocation" } }, 503)
    );
    fireEvent.click(screen.getByRole("button", { name: "Revoke other sessions" }));
    expect(await screen.findByText("Provider rejected revocation")).toBeInTheDocument();
    expect(screen.getByText("Other browser")).toBeInTheDocument();
  });

  it("saves an onboarding profile and reports profile save failures", async () => {
    mockActiveHydration();
    const { unmount } = render(<AccountCenter onboarding />);
    expect(await screen.findByText("Set up your account")).toBeInTheDocument();
    expect(screen.queryByText("Sessions and devices")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "Amit S" } });
    fireEvent.change(screen.getByLabelText("Timezone (IANA)"), {
      target: { value: "Europe/London" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /Allow AI processing/ }));
    fetchMock.mockResolvedValueOnce(
      response({
        account: {
          ...account,
          displayName: "Amit S",
          timezone: "Europe/London",
          onboardingCompleted: true,
        },
      })
    );
    fireEvent.click(screen.getByRole("button", { name: "Finish setup" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenLastCalledWith(
        "/api/v1/account",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({
            displayName: "Amit S",
            timezone: "Europe/London",
            onboardingCompleted: true,
            privacy: { allowPersonalization: true, allowAiProcessing: false },
          }),
        })
      )
    );
    expect(await screen.findByText("Your account is ready.")).toBeInTheDocument();
    unmount();

    fetchMock.mockReset();
    mockActiveHydration();
    render(<AccountCenter />);
    expect(await screen.findByText("Profile and privacy")).toBeInTheDocument();
    fetchMock.mockResolvedValueOnce(
      response({ error: { message: "Profile update was rejected" } }, 400)
    );
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Profile update was rejected")).toBeInTheDocument();
  });

  it("saves normal profile changes with the existing onboarding status", async () => {
    mockActiveHydration();
    render(<AccountCenter />);
    expect(await screen.findByText("Profile and privacy")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "Amit Sharma" } });
    fetchMock.mockResolvedValueOnce(
      response({ account: { ...account, displayName: "Amit Sharma" } })
    );

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByText("Account details saved.")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/v1/account",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          displayName: "Amit Sharma",
          timezone: "Asia/Kolkata",
          onboardingCompleted: true,
          privacy: { allowPersonalization: true, allowAiProcessing: true },
        }),
      })
    );
  });

  it("refreshes export status in place and preserves it on an error", async () => {
    const pending = {
      id: "55555555-5555-4555-8555-555555555555",
      status: "running",
      requestedAt: "2026-09-08T00:00:00.000Z",
    };
    mockActiveHydration({ exports: [pending] });
    const first = render(<AccountCenter />);
    expect(await screen.findByText("running")).toBeInTheDocument();

    fetchMock.mockResolvedValueOnce(response({ export: { ...pending, status: "ready" } }));
    fireEvent.click(screen.getByRole("button", { name: "Refresh status" }));
    expect(await screen.findByRole("link", { name: "Download" })).toBeInTheDocument();
    first.unmount();

    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(response({ account: { status: "active" }, deletion: null }));
    fetchMock.mockResolvedValueOnce(response({ account }));
    fetchMock.mockResolvedValueOnce(response({ sessions: [] }));
    fetchMock.mockResolvedValueOnce(response({ aiAvailable: true }));
    fetchMock.mockResolvedValueOnce(response({ exports: [pending] }));
    const { unmount } = render(<AccountCenter />);
    expect(await screen.findByText("running")).toBeInTheDocument();
    fetchMock.mockResolvedValueOnce(response({ error: { message: "Status refresh failed" } }, 503));
    fireEvent.click(screen.getByRole("button", { name: "Refresh status" }));
    expect(await screen.findByText("Status refresh failed")).toBeInTheDocument();
    expect(screen.getByText("running")).toBeInTheDocument();
    unmount();
  });

  it("recovers a deletion request after fresh authentication is renewed", async () => {
    mockActiveHydration();
    render(<AccountCenter />);
    fireEvent.click(await screen.findByRole("button", { name: "Request deletion" }));
    fireEvent.change(screen.getByLabelText("Type DELETE MY ACCOUNT to confirm"), {
      target: { value: "DELETE MY ACCOUNT" },
    });
    fetchMock.mockResolvedValueOnce(
      response(
        {
          error: {
            code: "FRESH_AUTH_REQUIRED",
            message: "Recent authentication is required",
            recovery: { kind: "CONTACT_OPERATOR_FOR_NEW_INVITATION" },
          },
        },
        403
      )
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirm deletion" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Recent authentication is required");
    fetchMock.mockResolvedValueOnce(
      response({ deletion: { id: "delete-1", status: "requested" } }, 202)
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry action" }));
    expect(await screen.findByText(/Deletion status: requested/)).toBeInTheDocument();
  });

  it("recovers cancellation after fresh authentication is renewed", async () => {
    mockActiveHydration({
      deletion: { id: "delete-1", status: "draining", purgeAfter: "2026-09-15T00:00:00.000Z" },
    });
    render(<AccountCenter />);
    expect(await screen.findByText(/Deletion status: draining/)).toBeInTheDocument();
    fetchMock.mockResolvedValueOnce(
      response(
        {
          error: {
            code: "FRESH_AUTH_REQUIRED",
            message: "Renew authentication before cancellation",
            recovery: { kind: "CONTACT_OPERATOR_FOR_NEW_INVITATION" },
          },
        },
        403
      )
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel deletion" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Renew authentication before cancellation"
    );
    fetchMock.mockResolvedValueOnce(
      response({ deletion: { id: "delete-1", status: "cancelled" } })
    );
    mockActiveHydration();
    fireEvent.click(screen.getByRole("button", { name: "Retry action" }));
    expect(await screen.findByText("Account deletion has been cancelled.")).toBeInTheDocument();
  });

  it.each([
    [null, "unavailable"],
    [{ id: "delete-1", status: "purging" }, "purging"],
  ])("does not offer cancellation once a pending deletion is %s", async (deletion, status) => {
    fetchMock.mockResolvedValueOnce(
      response({ account: { status: "deletion_pending" }, deletion })
    );
    render(<AccountCenter />);

    expect(await screen.findByText(new RegExp(`Deletion status: ${status}`))).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel deletion" })).not.toBeInTheDocument();
  });

  it("reports a failed account reload after a successful deletion cancellation", async () => {
    fetchMock.mockResolvedValueOnce(
      response({
        account: { status: "deletion_pending" },
        deletion: { id: "delete-1", status: "requested" },
      })
    );
    render(<AccountCenter />);
    expect(await screen.findByText(/Deletion status: requested/)).toBeInTheDocument();

    fetchMock.mockResolvedValueOnce(
      response({ deletion: { id: "delete-1", status: "cancelled" } })
    );
    fetchMock.mockResolvedValueOnce(response({ error: { message: "Account reload failed" } }, 503));
    fireEvent.click(screen.getByRole("button", { name: "Cancel deletion" }));

    expect(await screen.findByText("Account reload failed")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel deletion" })).not.toBeInTheDocument();
  });

  it("closes and resets deletion confirmation without making a request", async () => {
    mockActiveHydration();
    render(<AccountCenter />);
    fireEvent.click(await screen.findByRole("button", { name: "Request deletion" }));
    fireEvent.change(screen.getByLabelText("Type DELETE MY ACCOUNT to confirm"), {
      target: { value: "DELETE MY ACCOUNT" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Keep account" }));

    expect(screen.queryByRole("button", { name: "Confirm deletion" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Request deletion" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });
});
