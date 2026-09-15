/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const mockReplace = jest.fn();
const mockRefresh = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, refresh: mockRefresh }),
}));

import ResetPasswordPage from "../page";

const fetchMock = jest.mocked(global.fetch);
const response = (status: number, body: unknown = {}) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

beforeEach(() => {
  fetchMock.mockReset();
  mockReplace.mockReset();
  mockRefresh.mockReset();
  window.history.replaceState({}, "", "/reset-password");
});

it("requests a password link by email when there is no token", async () => {
  fetchMock.mockResolvedValue(response(202, { accepted: true }));
  render(<ResetPasswordPage />);

  fireEvent.change(await screen.findByLabelText("Email"), {
    target: { value: "amit@example.com" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Email me a password link" }));

  await waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/password/request-reset",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ email: "amit@example.com" }),
      })
    )
  );
  expect(
    await screen.findByText(
      "If this email belongs to a Distil account, a password link is on its way."
    )
  ).toBeInTheDocument();
});

it("shows an invalid-link message and the request form when the query has an error", async () => {
  window.history.replaceState({}, "", "/reset-password?error=INVALID_TOKEN");
  render(<ResetPasswordPage />);

  expect(await screen.findByText("This link is invalid or has expired.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Email me a password link" })).toBeInTheDocument();
});

it("sets a new password with a token and redirects to /invite?reset=1", async () => {
  window.history.replaceState({}, "", "/reset-password?token=abc123");
  fetchMock.mockResolvedValue(response(200, { reset: true }));
  render(<ResetPasswordPage />);

  fireEvent.change(await screen.findByLabelText("New password"), {
    target: { value: "a-long-enough-password" },
  });
  fireEvent.change(screen.getByLabelText("Confirm password"), {
    target: { value: "a-long-enough-password" },
  });
  fireEvent.submit(screen.getByRole("button", { name: "Save new password" }).closest("form")!);

  await waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/password/reset",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ token: "abc123", newPassword: "a-long-enough-password" }),
      })
    )
  );
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/invite?reset=1"));
});

it("blocks submission and shows an alert when passwords do not match", async () => {
  window.history.replaceState({}, "", "/reset-password?token=abc123");
  render(<ResetPasswordPage />);

  fireEvent.change(await screen.findByLabelText("New password"), {
    target: { value: "a-long-enough-password" },
  });
  fireEvent.change(screen.getByLabelText("Confirm password"), {
    target: { value: "different-password-value" },
  });
  fireEvent.submit(screen.getByRole("button", { name: "Save new password" }).closest("form")!);

  expect(await screen.findByRole("alert")).toHaveTextContent("Passwords do not match.");
  expect(fetchMock).not.toHaveBeenCalled();
});

it("shows the server error and a link to request a new link on failure", async () => {
  window.history.replaceState({}, "", "/reset-password?token=abc123");
  fetchMock.mockResolvedValue(response(400, { error: { message: "This link has expired." } }));
  render(<ResetPasswordPage />);

  fireEvent.change(await screen.findByLabelText("New password"), {
    target: { value: "a-long-enough-password" },
  });
  fireEvent.change(screen.getByLabelText("Confirm password"), {
    target: { value: "a-long-enough-password" },
  });
  fireEvent.submit(screen.getByRole("button", { name: "Save new password" }).closest("form")!);

  expect(await screen.findByRole("alert")).toHaveTextContent("This link has expired.");
  expect(screen.getByRole("link", { name: "Request a new link" })).toHaveAttribute(
    "href",
    "/reset-password"
  );
});
