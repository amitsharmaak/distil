/** @jest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";

import { DigestExperience } from "../digest-experience";
import type { DigestRun, PersonalPreferences } from "@/lib/digests/types";

jest.mock("@/lib/config", () => ({ config: { apiBaseUrl: "https://distil.test" } }));

const preferences: PersonalPreferences = {
  digestEnabled: true,
  digestTimezone: "Asia/Kolkata",
  personalizationEnabled: true,
  updatedAt: "2026-09-07T00:00:00.000Z",
};

const digest: DigestRun = {
  id: "digest-1",
  localDate: "2026-09-07",
  timezone: "Asia/Kolkata",
  status: "degraded",
  contentMode: "deterministic",
  selectionVersion: "deterministic-v1",
  selectionMetadata: {},
  title: "Your digest for 2026-09-07",
  summary: "A deterministic selection of 1 item for today.",
  createdAt: "2026-09-07T04:00:00.000Z",
  completedAt: "2026-09-07T04:00:00.000Z",
  items: [
    {
      digestRunId: "digest-1",
      itemId: "item-1",
      category: "priority",
      position: 0,
      reason: "Unread high priority item.",
      title: "Important source",
      summary: "Read this next.",
      selectionMetadata: {},
    },
  ],
};

function ok(payload: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: jest.fn().mockResolvedValue(payload),
  } as unknown as Response;
}

function unavailable(): Response {
  return {
    ok: false,
    status: 503,
    json: jest
      .fn()
      .mockResolvedValue({
        error: { code: "POSTGRES_REQUIRED", message: "Digests require PostgreSQL" },
      }),
  } as unknown as Response;
}

describe("DigestExperience", () => {
  let fetchMock: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    fetchMock = jest.mocked(global.fetch);
    fetchMock.mockImplementation((input, init) => {
      const path = String(input);
      if (path.endsWith("/preferences") && !init?.method)
        return Promise.resolve(ok({ preferences }));
      if (path.includes("/digests?") && !init?.method) return Promise.resolve(ok({ digests: [] }));
      return Promise.resolve(ok({ preferences }));
    });
  });

  it("shows an accessible loading state", () => {
    fetchMock.mockReturnValue(new Promise<Response>(() => {}) as Promise<Response>);
    render(<DigestExperience />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading digests");
  });

  it("shows disabled opt-in state and saves enablement", async () => {
    const disabled = { ...preferences, digestEnabled: false };
    fetchMock.mockImplementation((input, init) => {
      const path = String(input);
      if (path.endsWith("/preferences") && !init?.method)
        return Promise.resolve(ok({ preferences: disabled }));
      if (path.includes("/digests?") && !init?.method) return Promise.resolve(ok({ digests: [] }));
      if (init?.method === "PUT") return Promise.resolve(ok({ preferences }));
      return Promise.resolve(ok({}));
    });
    render(<DigestExperience />);
    expect(await screen.findByRole("heading", { name: "Digests are off" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Enable in-app digests" }));
    expect(await screen.findByText("Digest preferences saved")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://distil.test/api/v1/preferences",
      expect.objectContaining({ method: "PUT" })
    );
  });

  it("renders an enabled empty state with a mobile-sized Run now control", async () => {
    render(<DigestExperience />);
    expect(await screen.findByRole("heading", { name: "No digest yet" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run now" })).toHaveClass("min-h-11");
    expect(screen.getByText("No previous digests.")).toBeInTheDocument();
  });

  it("renders a safe unavailable state when the digest service is unavailable", async () => {
    fetchMock.mockImplementation((input) => {
      if (String(input).endsWith("/preferences")) return Promise.resolve(unavailable());
      return Promise.resolve(ok({ digests: [] }));
    });
    render(<DigestExperience />);
    expect(
      await screen.findByRole("heading", { name: "Digests are unavailable" })
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("feed and saved items remain available");
  });

  it("runs a digest, dismisses an item locally, and dismisses the digest through the API", async () => {
    const dismissed = { ...digest, dismissedAt: "2026-09-07T05:00:00.000Z" };
    fetchMock.mockImplementation((input, init) => {
      const path = String(input);
      if (path.endsWith("/preferences") && !init?.method)
        return Promise.resolve(ok({ preferences }));
      if (path.includes("/digests?") && !init?.method)
        return Promise.resolve(ok({ digests: [digest] }));
      if (path.endsWith("/digests/run") && init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        if (body.action === "dismiss") return Promise.resolve(ok({ digest: dismissed }));
        return Promise.resolve(ok({ digest }));
      }
      return Promise.resolve(ok({ preferences }));
    });
    render(<DigestExperience />);
    expect(await screen.findByRole("heading", { name: digest.title })).toBeInTheDocument();
    expect(screen.getByText("Unread high priority item.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss item" }));
    expect(await screen.findByText("No items remain in this digest.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss digest" }));
    expect(await screen.findByText("Digest dismissed")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://distil.test/api/v1/digests/run",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("shows run errors without losing the current page", async () => {
    fetchMock.mockImplementation((input, init) => {
      const path = String(input);
      if (path.endsWith("/preferences") && !init?.method)
        return Promise.resolve(ok({ preferences }));
      if (path.includes("/digests?") && !init?.method) return Promise.resolve(ok({ digests: [] }));
      if (path.endsWith("/digests/run")) {
        return Promise.resolve({
          ok: false,
          status: 500,
          json: jest.fn().mockResolvedValue({ error: { message: "Try again later" } }),
        } as unknown as Response);
      }
      return Promise.resolve(ok({ preferences }));
    });
    render(<DigestExperience />);
    await screen.findByRole("heading", { name: "No digest yet" });
    fireEvent.click(screen.getByRole("button", { name: "Run now" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Try again later");
    expect(screen.getByRole("heading", { name: "No digest yet" })).toBeInTheDocument();
  });
});
