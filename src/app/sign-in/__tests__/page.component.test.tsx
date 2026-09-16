/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";

jest.mock("@/lib/browser-navigation", () => ({ navigateFullPage: jest.fn() }));

import { navigateFullPage } from "@/lib/browser-navigation";

import SignInPage from "../page";

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
  jest.mocked(navigateFullPage).mockReset();
  window.history.replaceState({}, "", "/sign-in");
});

it("signs in with a password and redirects home", async () => {
  fetchMock.mockResolvedValue(response(200, { authenticated: true }));
  render(<SignInPage />);

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
  // Full navigation, not a client-side replace: see the comment in the page.
  await waitFor(() => expect(navigateFullPage).toHaveBeenCalledWith("/", window.location));
});

it("shows the server message on an invalid password", async () => {
  fetchMock.mockResolvedValue(
    response(401, { error: { code: "UNAUTHORIZED", message: "Invalid email or password" } })
  );
  render(<SignInPage />);

  submitSignIn("amit@example.com", "wrong-password");

  expect(await screen.findByRole("alert")).toHaveTextContent("Invalid email or password");
  expect(navigateFullPage).not.toHaveBeenCalled();
});

it("shows a generic message for other sign-in failures", async () => {
  fetchMock.mockResolvedValue(response(503, {}));
  render(<SignInPage />);

  submitSignIn("amit@example.com", "some-password");

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Unable to continue. Please try again."
  );
});

it("sends a magic link when requested", async () => {
  fetchMock.mockResolvedValue(response(202));
  render(<SignInPage />);

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
  window.history.replaceState({}, "", "/sign-in?reset=1");
  render(<SignInPage />);

  expect(
    await screen.findByText("Password updated. Sign in with your new password.")
  ).toBeInTheDocument();
});
