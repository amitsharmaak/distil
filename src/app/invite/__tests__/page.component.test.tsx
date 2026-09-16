/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const mockReplace = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ replace: mockReplace }) }));

import InvitePage from "../page";

const fetchMock = jest.mocked(global.fetch);
const response = (status: number, body: unknown = {}) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

beforeEach(() => {
  fetchMock.mockReset();
  mockReplace.mockReset();
  window.history.replaceState({}, "", "/invite");
});

it("redirects to /sign-in when there is no invitation token", async () => {
  render(<InvitePage />);

  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/sign-in"));
});

it("keeps invitation acceptance token-bound and renders a generic failure", async () => {
  window.history.replaceState({}, "", "/invite#token=invitation-token");
  fetchMock.mockResolvedValue(response(403));
  render(<InvitePage />);

  const submitButton = await screen.findByRole("button", { name: "Email me a magic link" });
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "invitee@example.com" } });
  fireEvent.submit(submitButton.closest("form")!);

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
  expect(mockReplace).not.toHaveBeenCalled();
});
