/** @jest-environment jsdom */

import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const mockReplace = jest.fn();
const mockRefresh = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, refresh: mockRefresh }),
}));

jest.mock("@/components/capture/token-settings", () => ({
  TokenSettings: () => <div>Capture token management</div>,
}));
jest.mock("@/lib/browser-navigation", () => ({ replaceFullPage: jest.fn() }));

import { AccountCenter } from "@/components/account/account-center";
import { replaceFullPage } from "@/lib/browser-navigation";
import { CONTENT_AUTH_EVENT } from "@/lib/client-cache/auth-events";
import { ContentCacheProvider } from "@/lib/client-cache/content-cache";

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
  email: "amit@example.com",
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
    mockReplace.mockReset();
    mockRefresh.mockReset();
    jest.mocked(replaceFullPage).mockReset();
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
      "Send a new sign-in link to the verified email on this account"
    );
    expect(screen.getByRole("button", { name: "Email verification link" })).toBeInTheDocument();
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

  it("signs out through the hosted-auth route and leaves by a full document load", async () => {
    mockActiveHydration({ sessions: [currentSession] });
    render(
      <ContentCacheProvider accountKey={account.userId}>
        <AccountCenter />
      </ContentCacheProvider>
    );
    expect(await screen.findByText("This device")).toBeInTheDocument();
    const order: string[] = [];
    const announced = () => order.push("announced");
    window.addEventListener(CONTENT_AUTH_EVENT, announced);
    jest.mocked(replaceFullPage).mockImplementation(() => {
      order.push("left");
    });

    fetchMock.mockResolvedValueOnce(response({ success: true }));
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/auth/sign-out", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      })
    );
    await waitFor(() => expect(replaceFullPage).toHaveBeenCalledWith("/sign-in", window.location));
    window.removeEventListener(CONTENT_AUTH_EVENT, announced);
    // The data cache and other tabs are cleared first; then the document, and with it the
    // router cache of every route this account visited, is discarded.
    expect(order).toEqual(["announced", "left"]);
    // This tab goes straight to /sign-in; the session notice is for other tabs.
    expect(screen.queryByText("Your session changed.")).not.toBeInTheDocument();
    // A client-side replace or refresh would keep the previous account's cached routes.
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("keeps the account page available when sign-out fails", async () => {
    mockActiveHydration({ sessions: [currentSession] });
    render(<AccountCenter />);
    expect(await screen.findByText("This device")).toBeInTheDocument();

    fetchMock.mockResolvedValueOnce(
      response({ error: { message: "Provider rejected sign-out" } }, 503)
    );
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    expect(await screen.findByText("Provider rejected sign-out")).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(replaceFullPage).not.toHaveBeenCalled();
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
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/"));
    expect(mockRefresh).not.toHaveBeenCalled();
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
    expect(mockRefresh).toHaveBeenCalledTimes(1);
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

  it("starts a real provider reauthentication ceremony for a stale session", async () => {
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

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    fetchMock.mockResolvedValueOnce(response({ accepted: true }, 202));
    fireEvent.click(screen.getByRole("button", { name: "Email verification link" }));
    expect(fetchMock).toHaveBeenLastCalledWith("/api/auth/reauthenticate", { method: "POST" });
    expect(
      await screen.findByText(
        "Verification link sent. Open it in this browser, then retry the action."
      )
    ).toBeInTheDocument();
  });

  it("shows the verified landing once after a completed reauthentication link and drops the marker", async () => {
    window.history.replaceState(null, "", "/account?reauthenticated=1&keep=1");
    try {
      mockActiveHydration();
      render(<AccountCenter />);
      expect(await screen.findByText(/You're verified for the next 10 minutes/)).toHaveAttribute(
        "role",
        "status"
      );
      expect(window.location.search).toBe("?keep=1");
      expect(await screen.findByRole("button", { name: "Request export" })).toBeInTheDocument();
    } finally {
      window.history.replaceState(null, "", "/");
    }
  });

  it("shows the verified landing while deletion is pending so cancellation can be retried", async () => {
    window.history.replaceState(null, "", "/account?reauthenticated=1");
    try {
      mockActiveHydration({
        deletion: { id: "delete-1", status: "draining", purgeAfter: "2026-09-15T00:00:00.000Z" },
      });
      render(<AccountCenter />);
      expect(await screen.findByText(/Deletion status: draining/)).toBeInTheDocument();
      expect(screen.getByText(/You're verified for the next 10 minutes/)).toBeInTheDocument();
      expect(window.location.search).toBe("");
    } finally {
      window.history.replaceState(null, "", "/");
    }
  });

  it("does not claim verification without the marker", async () => {
    mockActiveHydration();
    render(<AccountCenter />);
    expect(await screen.findByRole("button", { name: "Request export" })).toBeInTheDocument();
    expect(screen.queryByText(/You're verified/)).not.toBeInTheDocument();
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

  it("changes the password and shows the sign-out notice", async () => {
    mockActiveHydration();
    render(<AccountCenter />);
    await screen.findByText("Profile and privacy");

    fireEvent.change(screen.getByLabelText("Current password"), {
      target: { value: "old-password-value" },
    });
    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "new-password-value" },
    });
    fireEvent.change(screen.getByLabelText("Confirm password"), {
      target: { value: "new-password-value" },
    });
    fetchMock.mockResolvedValueOnce(response({ changed: true }));
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/auth/password/change",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            currentPassword: "old-password-value",
            newPassword: "new-password-value",
          }),
        })
      )
    );
    expect(
      await screen.findByText("Password changed. Other sessions were signed out.")
    ).toBeInTheDocument();
  });

  it("shows the server error when a password change fails", async () => {
    mockActiveHydration();
    render(<AccountCenter />);
    await screen.findByText("Profile and privacy");

    fireEvent.change(screen.getByLabelText("Current password"), {
      target: { value: "wrong-password-value" },
    });
    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "new-password-value" },
    });
    fireEvent.change(screen.getByLabelText("Confirm password"), {
      target: { value: "new-password-value" },
    });
    fetchMock.mockResolvedValueOnce(
      response({ error: { message: "Current password is incorrect." } }, 400)
    );
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));

    expect(await screen.findByText("Current password is incorrect.")).toBeInTheDocument();
  });

  it("sends a password setup link to the account email", async () => {
    mockActiveHydration();
    render(<AccountCenter />);
    await screen.findByText("Profile and privacy");

    fetchMock.mockResolvedValueOnce(response({ accepted: true }, 202));
    fireEvent.click(screen.getByRole("button", { name: "Email me a password setup link" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenLastCalledWith(
        "/api/auth/password/request-reset",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ email: account.email }),
        })
      )
    );
    expect(
      await screen.findByText(
        "If this email belongs to a Distil account, a password link is on its way."
      )
    ).toBeInTheDocument();
  });
});

describe("AccountCenter export requests", () => {
  const exportId = "55555555-5555-4555-8555-555555555555";
  const pendingExport = {
    id: exportId,
    status: "pending",
    requestedAt: "2026-10-02T00:00:00.000Z",
  };
  const statusUrl = `/api/v1/account/exports/${exportId}`;
  // The component's polling bounds: every five seconds, at most 36 times.
  const EXPORT_POLL_INTERVAL_MS = 5_000;
  const EXPORT_POLL_MAX_ATTEMPTS = 36;
  const exportSection = () => screen.getByRole("region", { name: "Your data export" });
  const postCalls = () =>
    fetchMock.mock.calls.filter(
      ([url, init]) => url === "/api/v1/account/export" && init?.method === "POST"
    );
  const statusCalls = () => fetchMock.mock.calls.filter(([url]) => url === statusUrl);
  // Fires due timers, then lets the mocked fetch and its state updates settle.
  const advance = (milliseconds: number) =>
    act(async () => {
      jest.advanceTimersByTime(milliseconds);
      for (let turn = 0; turn < 20; turn += 1) await Promise.resolve();
    });
  const flush = () => advance(0);
  const nextPoll = () => advance(EXPORT_POLL_INTERVAL_MS);

  beforeEach(() => {
    fetchMock.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("disables the button and shows progress while the request is pending", async () => {
    mockActiveHydration();
    render(<AccountCenter />);
    const button = await screen.findByRole("button", { name: "Request export" });
    let resolvePost: (value: Response) => void = () => undefined;
    fetchMock.mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        resolvePost = resolve;
      })
    );

    fireEvent.click(button);

    const busy = await screen.findByRole("button", { name: "Requesting export…" });
    expect(busy).toBeDisabled();

    await act(async () => resolvePost(response({ export: pendingExport, created: true }, 202)));

    const section = exportSection();
    expect(
      await within(section).findByText(
        "Your export has been requested. It will appear here when ready."
      )
    ).toBeInTheDocument();
    // An unfinished export keeps the button disabled, with the reason beside it.
    expect(within(section).getByRole("button", { name: "Request export" })).toBeDisabled();
    expect(
      within(section).getByText(
        "An export is in progress. You can request another when it finishes."
      )
    ).toBeInTheDocument();
  });

  it("sends one request for a double click", async () => {
    mockActiveHydration();
    render(<AccountCenter />);
    const button = await screen.findByRole("button", { name: "Request export" });
    fetchMock.mockResolvedValue(response({ export: pendingExport, created: true }, 202));

    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);

    expect(await screen.findByText("pending")).toBeInTheDocument();
    expect(postCalls()).toHaveLength(1);
  });

  it("says so when the server hands back an export that is already in progress", async () => {
    mockActiveHydration();
    render(<AccountCenter />);
    const button = await screen.findByRole("button", { name: "Request export" });
    fetchMock.mockResolvedValueOnce(
      response({ export: { ...pendingExport, status: "running" }, created: false }, 202)
    );

    fireEvent.click(button);

    expect(
      await within(exportSection()).findByText(
        "An export is already in progress. It is shown below."
      )
    ).toBeInTheDocument();
    expect(screen.getAllByText("running")).toHaveLength(1);
  });

  it("renders request errors inside the export section and re-enables the button", async () => {
    mockActiveHydration();
    render(<AccountCenter />);
    const button = await screen.findByRole("button", { name: "Request export" });
    fetchMock.mockResolvedValueOnce(
      response({ error: { code: "QUOTA_EXCEEDED", message: "Export quota exhausted" } }, 429)
    );

    fireEvent.click(button);

    const section = exportSection();
    const message = await within(section).findByText("Export quota exhausted");
    expect(message.closest("[aria-live]")).toHaveAttribute("aria-live", "polite");
    expect(screen.getAllByText("Export quota exhausted")).toHaveLength(1);
    expect(within(section).getByRole("button", { name: "Request export" })).toBeEnabled();

    fetchMock.mockRejectedValueOnce(new TypeError("network down"));
    fireEvent.click(within(section).getByRole("button", { name: "Request export" }));
    expect(
      await within(section).findByText("Could not request an export. Please try again.")
    ).toBeInTheDocument();
    expect(within(section).queryByText("Export quota exhausted")).not.toBeInTheDocument();
    expect(within(section).getByRole("button", { name: "Request export" })).toBeEnabled();
  });

  it("keeps the fresh-authentication recovery next to the export button", async () => {
    mockActiveHydration();
    render(<AccountCenter />);
    const button = await screen.findByRole("button", { name: "Request export" });
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

    fireEvent.click(button);

    const section = exportSection();
    expect(await within(section).findByRole("alert")).toHaveTextContent(
      "Recent authentication is required for this account action"
    );
    expect(screen.getAllByRole("alert")).toHaveLength(1);

    fetchMock.mockResolvedValueOnce(response({ accepted: true }, 202));
    fireEvent.click(within(section).getByRole("button", { name: "Email verification link" }));
    expect(
      await within(section).findByText(
        "Verification link sent. Open it in this browser, then retry the action."
      )
    ).toBeInTheDocument();
  });

  it("shows a plain message for a failed export, preferring the server's safe text", async () => {
    mockActiveHydration({
      exports: [
        {
          ...pendingExport,
          status: "failed",
          failureMessage: "Export storage is not available right now. Please try again later.",
        },
        { ...pendingExport, id: "66666666-6666-4666-8666-666666666666", status: "failed" },
      ],
    });
    render(<AccountCenter />);

    const section = await screen.findByRole("region", { name: "Your data export" });
    expect(
      await within(section).findByText(
        "Export storage is not available right now. Please try again later."
      )
    ).toBeInTheDocument();
    expect(
      within(section).getByText("This export could not be created. Please request a new one.")
    ).toBeInTheDocument();
    // A failed export is terminal: a new request is allowed.
    expect(within(section).getByRole("button", { name: "Request export" })).toBeEnabled();
  });

  it("polls an unfinished export and stops when it reaches a terminal state", async () => {
    jest.useFakeTimers();
    mockActiveHydration({ exports: [pendingExport] });
    render(<AccountCenter />);
    await flush();
    expect(screen.getByText("pending")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Request export" })).toBeDisabled();
    expect(statusCalls()).toHaveLength(0);

    fetchMock.mockResolvedValueOnce(response({ export: { ...pendingExport, status: "running" } }));
    await nextPoll();
    expect(statusCalls()).toHaveLength(1);
    expect(statusCalls()[0][1]).toMatchObject({ headers: { Accept: "application/json" } });
    expect(screen.getByText("running")).toBeInTheDocument();

    fetchMock.mockResolvedValueOnce(
      response({
        export: {
          ...pendingExport,
          status: "failed",
          failureMessage: "Export storage is not available right now. Please try again later.",
        },
      })
    );
    await nextPoll();
    expect(statusCalls()).toHaveLength(2);
    expect(screen.getByText("failed")).toBeInTheDocument();
    expect(
      screen.getByText("Export storage is not available right now. Please try again later.")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Request export" })).toBeEnabled();

    await nextPoll();
    await nextPoll();
    expect(statusCalls()).toHaveLength(2);
  });

  it("stops polling at the cap and says how to check again", async () => {
    jest.useFakeTimers();
    mockActiveHydration({ exports: [pendingExport] });
    render(<AccountCenter />);
    await flush();
    // Failed reads count towards the cap as well.
    fetchMock.mockResolvedValueOnce(response({ error: { message: "unavailable" } }, 503));
    fetchMock.mockRejectedValueOnce(new TypeError("network down"));
    fetchMock.mockResolvedValue(response({ export: pendingExport }));

    for (let attempt = 0; attempt < EXPORT_POLL_MAX_ATTEMPTS; attempt += 1) await nextPoll();
    expect(statusCalls()).toHaveLength(EXPORT_POLL_MAX_ATTEMPTS);
    expect(
      await screen.findByText(
        "This export is taking longer than usual. Use Refresh status to check again."
      )
    ).toBeInTheDocument();

    await nextPoll();
    await nextPoll();
    expect(statusCalls()).toHaveLength(EXPORT_POLL_MAX_ATTEMPTS);
    expect(screen.getByRole("button", { name: "Request export" })).toBeDisabled();
  });

  it("stops polling when the page is left", async () => {
    jest.useFakeTimers();
    mockActiveHydration({ exports: [pendingExport] });
    const { unmount } = render(<AccountCenter />);
    await flush();
    fetchMock.mockResolvedValue(response({ export: pendingExport }));
    await nextPoll();
    expect(statusCalls()).toHaveLength(1);

    unmount();
    await nextPoll();
    await nextPoll();
    expect(statusCalls()).toHaveLength(1);
  });
});
