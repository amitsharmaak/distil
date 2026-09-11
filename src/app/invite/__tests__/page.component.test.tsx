/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const mockReplace = jest.fn();
const mockRefresh = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, refresh: mockRefresh }),
}));

import InvitePage from "../page";

const fetchMock = jest.mocked(global.fetch);
const response = (status: number, body: unknown = {}) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

function submitSignIn(email: string, password: string): void {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: email } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: password } });
  fireEvent.submit(screen.getByRole("button", { name: "Sign in" }).closest("form")!);
}

beforeEach(() => {
  fetchMock.mockReset();
  mockReplace.mockReset();
  mockRefresh.mockReset();
  window.history.replaceState({}, "", "/invite");
});

it("signs in with a password and redirects home", async () => {
  fetchMock.mockResolvedValue(response(200, { authenticated: true }));
  render(<InvitePage />);

  submitSignIn("amit@example.com", "correct horse battery staple");

  await waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/sign-in/password",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          email: "amit@example.com",
          password: "correct horse battery staple",
        }),
      })
    )
  );
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/"));
  expect(mockRefresh).toHaveBeenCalledTimes(1);
});

it("shows the server message on an invalid password", async () => {
  fetchMock.mockResolvedValue(
    response(401, { error: { code: "UNAUTHORIZED", message: "Invalid email or password" } })
  );
  render(<InvitePage />);

  submitSignIn("amit@example.com", "wrong-password");

  expect(await screen.findByRole("alert")).toHaveTextContent("Invalid email or password");
  expect(mockReplace).not.toHaveBeenCalled();
});

it("shows a generic message for other sign-in failures", async () => {
  fetchMock.mockResolvedValue(response(503, {}));
  render(<InvitePage />);

  submitSignIn("amit@example.com", "some-password");

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Unable to continue. Please try again."
  );
});

it("still sends a magic link from the returning-user card", async () => {
  fetchMock.mockResolvedValue(response(202));
  render(<InvitePage />);

  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "amit@example.com" } });
  fireEvent.click(screen.getByRole("button", { name: "Email me a magic link instead" }));

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

it("shows the reset-password notice when redirected with ?reset=1", async () => {
  window.history.replaceState({}, "", "/invite?reset=1");
  render(<InvitePage />);

  expect(
    await screen.findByText("Password updated. Sign in with your new password.")
  ).toBeInTheDocument();
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
});
