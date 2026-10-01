/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { InvitationsSettings } from "@/components/settings/invitations-settings";

const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>;
const response = (body: unknown, status = 200) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

const pending = {
  id: "33333333-3333-4333-8333-333333333333",
  maskedEmail: "c***@example.com",
  status: "pending",
  createdAt: "2026-09-30T00:00:00.000Z",
  expiresAt: "2026-10-07T00:00:00.000Z",
  issuedByYou: true,
};

describe("InvitationsSettings", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    Object.assign(navigator, { clipboard: { writeText: jest.fn() } });
  });

  it("explains the flow when there are no invitations", async () => {
    fetchMock.mockResolvedValueOnce(response({ invitations: [] }));
    render(<InvitationsSettings />);
    expect(await screen.findByText(/No invitations yet/)).toBeInTheDocument();
    expect(screen.getByText(/to finish signing up/)).toBeInTheDocument();
  });

  it("sends an invitation, shows the link once with Copy, and refreshes the list", async () => {
    fetchMock
      .mockResolvedValueOnce(response({ invitations: [] }))
      .mockResolvedValueOnce(
        response(
          {
            invitationId: pending.id,
            invitationUrl: "https://distil.example/invite#token=abc.def",
            expiresAt: "2026-10-07T00:00:00.000Z",
          },
          201
        )
      )
      .mockResolvedValueOnce(response({ invitations: [pending] }));
    render(<InvitationsSettings />);
    await screen.findByText(/No invitations yet/);

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: " colleague@example.com " },
    });
    fireEvent.change(screen.getByLabelText(/Note/), { target: { value: "Design pilot" } });
    fireEvent.click(screen.getByRole("button", { name: "Send invitation" }));

    expect(await screen.findByText("https://distil.example/invite#token=abc.def")).toBeVisible();
    expect(screen.getByText(/will not be shown again/)).toBeInTheDocument();
    const post = fetchMock.mock.calls[1];
    expect(post[0]).toBe("/api/v1/admin/invitations");
    expect(post[1]).toMatchObject({ method: "POST" });
    expect(JSON.parse(String(post[1]?.body))).toEqual({
      email: "colleague@example.com",
      note: "Design pilot",
    });

    fireEvent.click(screen.getByRole("button", { name: "Copy invitation link" }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      "https://distil.example/invite#token=abc.def"
    );
    expect(await screen.findByText("c***@example.com")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(screen.getByLabelText("Email address")).toHaveValue("");
  });

  it("shows the server's message when sending fails and keeps no link", async () => {
    fetchMock
      .mockResolvedValueOnce(response({ invitations: [] }))
      .mockResolvedValueOnce(
        response({ error: { code: "RATE_LIMITED", message: "Rate limit exceeded" } }, 429)
      );
    render(<InvitationsSettings />);
    await screen.findByText(/No invitations yet/);
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "colleague@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send invitation" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Rate limit exceeded");
    expect(screen.queryByRole("button", { name: "Copy invitation link" })).not.toBeInTheDocument();
  });

  it("lists every status and offers Revoke only for pending invitations", async () => {
    fetchMock.mockResolvedValueOnce(
      response({
        invitations: [
          pending,
          {
            ...pending,
            id: "a",
            maskedEmail: "a***@x.com",
            status: "accepted",
            acceptedAt: "2026-10-01T00:00:00.000Z",
          },
          {
            ...pending,
            id: "b",
            maskedEmail: "b***@x.com",
            status: "revoked",
            revokedAt: "2026-10-01T00:00:00.000Z",
          },
          { ...pending, id: "c", maskedEmail: "d***@x.com", status: "expired", issuedByYou: false },
        ],
      })
    );
    render(<InvitationsSettings />);
    await screen.findByText("c***@example.com");
    for (const label of ["Pending", "Accepted", "Revoked", "Expired"]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    expect(screen.getAllByRole("button", { name: "Revoke…" })).toHaveLength(1);
    expect(screen.getByText(/by another admin/)).toBeInTheDocument();
  });

  it("asks for a reason, revokes, and reloads the list", async () => {
    fetchMock
      .mockResolvedValueOnce(response({ invitations: [pending] }))
      .mockResolvedValueOnce({ ok: true, status: 204 } as Response)
      .mockResolvedValueOnce(
        response({
          invitations: [{ ...pending, status: "revoked", revokedAt: "2026-10-01T00:00:00.000Z" }],
        })
      );
    render(<InvitationsSettings />);
    fireEvent.click(await screen.findByRole("button", { name: "Revoke…" }));
    expect(screen.getByText(/stops working immediately/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: "wrong address" } });
    fireEvent.click(screen.getByRole("button", { name: "Revoke invitation" }));

    await waitFor(() => expect(screen.getByText("Revoked")).toBeInTheDocument());
    const call = fetchMock.mock.calls[1];
    expect(call[0]).toBe(`/api/v1/admin/invitations/${pending.id}`);
    expect(call[1]).toMatchObject({ method: "DELETE" });
    expect(JSON.parse(String(call[1]?.body))).toEqual({ reason: "wrong address" });
    expect(screen.queryByRole("button", { name: "Revoke…" })).not.toBeInTheDocument();
  });

  it("can cancel a revoke without calling the API", async () => {
    fetchMock.mockResolvedValueOnce(response({ invitations: [pending] }));
    render(<InvitationsSettings />);
    fireEvent.click(await screen.findByRole("button", { name: "Revoke…" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText(/stops working immediately/)).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
