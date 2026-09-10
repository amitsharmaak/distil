/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import InvitePage from "../page";

const fetchMock = jest.mocked(global.fetch);
const response = (status: number) => ({ ok: status >= 200 && status < 300 }) as Response;

function submit(email: string): void {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: email } });
  fireEvent.submit(screen.getByRole("button", { name: "Email me a magic link" }).closest("form")!);
}

beforeEach(() => {
  fetchMock.mockReset();
  window.history.replaceState({}, "", "/invite");
});

it("starts returning-user sign-in without an invitation fragment", async () => {
  fetchMock.mockResolvedValue(response(202));
  render(<InvitePage />);

  submit("amit@example.com");

  await waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/sign-in/request-link",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ email: "amit@example.com" }),
      })
    )
  );
  expect(await screen.findByText(/one-time sign-in link is on its way/i)).toBeInTheDocument();
});

it("keeps invitation acceptance token-bound and renders a generic failure", async () => {
  window.history.replaceState({}, "", "/invite#token=invitation-token");
  fetchMock.mockResolvedValue(response(403));
  render(<InvitePage />);

  submit("invitee@example.com");

  await waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/invitations/request-link",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          email: "invitee@example.com",
          invitationToken: "invitation-token",
          next: "/onboarding",
        }),
      })
    )
  );
  expect(window.location.hash).toBe("");
  expect(await screen.findByText(/Unable to continue/i)).toBeInTheDocument();
});
