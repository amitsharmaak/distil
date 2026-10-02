/** @jest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import { TokenSettings } from "@/components/capture/token-settings";

const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>;
const response = (body: unknown, status: number) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

const summary = {
  id: "token-1",
  name: "Capture token",
  kind: "manual",
  tokenPrefix: "dst_cap_abcdefgh",
  createdAt: "2026-03-01T00:00:00Z",
};

describe("TokenSettings", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    Object.assign(navigator, { clipboard: { writeText: jest.fn() } });
  });

  it("ignores phone and browser tokens in the manual card and replacement count", async () => {
    fetchMock.mockResolvedValueOnce(
      response(
        {
          tokens: [
            { ...summary, id: "phone", kind: "phone", tokenPrefix: "phone-prefix" },
            { ...summary, id: "browser", kind: "browser", tokenPrefix: "browser-prefix" },
            { ...summary, id: "revoked", revokedAt: "2026-10-01T00:00:00Z" },
          ],
        },
        200
      )
    );
    render(<TokenSettings />);
    expect(await screen.findByRole("button", { name: "Generate token" })).toBeInTheDocument();
    expect(
      screen.queryByText(/phone-prefix|browser-prefix|older token|iPhone Shortcut/)
    ).not.toBeInTheDocument();
  });

  it("generates the first token and shows it once for copying", async () => {
    const issued = { ...summary, token: "dst_cap_secret" };
    fetchMock
      .mockResolvedValueOnce(response({ tokens: [] }, 200))
      .mockResolvedValueOnce(response({ token: issued }, 201))
      .mockResolvedValueOnce(response({ tokens: [summary] }, 200));
    render(<TokenSettings />);
    fireEvent.click(await screen.findByRole("button", { name: "Generate token" }));
    await screen.findByText("dst_cap_secret");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/capture-tokens",
      expect.objectContaining({ method: "POST" })
    );
    fireEvent.click(screen.getByRole("button", { name: "Copy token" }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("dst_cap_secret");
    expect(await screen.findByText("dst_cap_abcdefgh…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Regenerate…" })).toBeInTheDocument();
  });

  it("confirms before regenerating and notes older active tokens", async () => {
    const legacy = { ...summary, id: "token-0", tokenPrefix: "dst_cap_legacy00" };
    fetchMock.mockResolvedValueOnce(response({ tokens: [summary, legacy] }, 200));
    render(<TokenSettings />);
    await screen.findByText("dst_cap_abcdefgh…");
    expect(screen.queryByText("dst_cap_legacy00…")).not.toBeInTheDocument();
    expect(screen.getByText(/1 older token is also still active/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Regenerate…" }));
    expect(screen.getByText(/stops working immediately/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText(/stops working immediately/)).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock
      .mockResolvedValueOnce(
        response({ token: { ...summary, id: "token-2", token: "dst_cap_fresh" } }, 201)
      )
      .mockResolvedValueOnce(response({ tokens: [{ ...summary, id: "token-2" }] }, 200));
    fireEvent.click(screen.getByRole("button", { name: "Regenerate…" }));
    fireEvent.click(screen.getByRole("button", { name: "Regenerate token" }));
    await screen.findByText("dst_cap_fresh");
    expect(screen.queryByText(/older token/)).not.toBeInTheDocument();
  });
});
