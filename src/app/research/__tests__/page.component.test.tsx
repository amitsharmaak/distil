/** @jest-environment jsdom */

import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import ResearchListPage from "../page";
import { ShortcutsProvider } from "@/components/shortcuts/shortcuts-provider";

jest.mock("next/navigation", () => ({
  usePathname: () => "/research",
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));
jest.mock("@/lib/config", () => ({ config: { apiBaseUrl: "https://distil.test" } }));
jest.mock("@/components/feed/deep-research", () => ({
  DeepResearch: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const fetchMock = jest.fn();

beforeEach(() => {
  fetchMock.mockImplementation((url: string, init?: { method?: string }) => {
    if (init?.method === "POST") {
      return Promise.resolve({
        ok: true,
        json: async () => ({ clustersFound: 0, suggestionsSaved: 0 }),
      });
    }
    return Promise.resolve({
      ok: true,
      json: async () => (url.includes("suggestions") ? { suggestions: [] } : { reports: [] }),
    });
  });
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    writable: true,
    value: fetchMock,
  });
});

async function renderPage() {
  render(<ResearchListPage />, { wrapper: ShortcutsProvider });
  await screen.findByText("No research reports yet");
}

describe("Research list shortcuts", () => {
  it("n opens the new research trigger", async () => {
    await renderPage();
    const trigger = screen.getByRole("button", { name: /Deep Research/ });
    const onClick = jest.fn();
    trigger.addEventListener("click", onClick);
    fireEvent.keyDown(document.body, { key: "n" });
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(trigger).toHaveAttribute("aria-keyshortcuts", "n");
  });

  it("Shift+S starts a scan", async () => {
    await renderPage();
    await act(async () => {
      fireEvent.keyDown(document.body, { key: "S", shiftKey: true });
    });
    expect(fetchMock).toHaveBeenCalledWith("https://distil.test/api/ai/research/proactive", {
      method: "POST",
    });
    expect(screen.getByRole("button", { name: "Scan for topics" })).toHaveAttribute(
      "aria-keyshortcuts",
      "Shift+S"
    );
  });
});
