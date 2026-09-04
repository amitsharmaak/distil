/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const replace = jest.fn();
const refresh = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh }) }));
jest.mock("next/image", () => ({
  __esModule: true,
  default: () => <span data-testid="logo" />,
}));

import LoginPage from "../page";

const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>;
const response = (body: unknown, status: number) =>
  ({ ok: status >= 200 && status < 300, json: async () => body }) as Response;

function submit(password = "secret") {
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: password } });
  fireEvent.submit(screen.getByRole("button", { name: "Sign in" }).closest("form")!);
}

beforeEach(() => {
  fetchMock.mockReset();
  replace.mockReset();
  refresh.mockReset();
  window.history.replaceState({}, "", "/login");
});

it("signs in and restores a validated protected destination", async () => {
  window.history.replaceState({}, "", "/login?next=%2Ffeed%2Fitem-1%3Ffilter%3Dunread");
  fetchMock.mockResolvedValue(response({}, 200));
  render(<LoginPage />);

  submit();

  await waitFor(() => expect(replace).toHaveBeenCalledWith("/feed/item-1?filter=unread"));
  expect(refresh).toHaveBeenCalled();
  expect(fetchMock).toHaveBeenCalledWith(
    "/api/auth/login",
    expect.objectContaining({ method: "POST", body: JSON.stringify({ password: "secret" }) })
  );
});

it.each(["", "?next=https%3A%2F%2Fevil.test", "?next=%2F%2Fevil.test"])(
  "falls back to save for an absent or hostile destination: %s",
  async (search) => {
    window.history.replaceState({}, "", `/login${search}`);
    fetchMock.mockResolvedValue(response({}, 200));
    render(<LoginPage />);
    submit();
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/save"));
  }
);

it("renders the server error and restores the enabled button", async () => {
  fetchMock.mockResolvedValue(response({ error: { message: "Wrong password." } }, 401));
  render(<LoginPage />);
  submit("wrong");
  expect(await screen.findByRole("alert")).toHaveTextContent("Wrong password.");
  expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
});

it("uses safe fallbacks for an empty error envelope and a non-Error rejection", async () => {
  fetchMock.mockResolvedValueOnce(response({}, 500));
  const { unmount } = render(<LoginPage />);
  submit();
  expect(await screen.findByRole("alert")).toHaveTextContent("Unable to sign in.");
  unmount();

  fetchMock.mockRejectedValueOnce("offline");
  render(<LoginPage />);
  submit();
  expect(await screen.findByRole("alert")).toHaveTextContent("Unable to sign in.");
});

it("disables the form while authentication is pending", async () => {
  let resolveResponse!: (value: Response) => void;
  fetchMock.mockReturnValue(new Promise((resolve) => (resolveResponse = resolve)));
  render(<LoginPage />);
  submit();
  expect(screen.getByRole("button", { name: "Signing in…" })).toBeDisabled();
  resolveResponse(response({}, 200));
  await waitFor(() => expect(replace).toHaveBeenCalledWith("/save"));
});
