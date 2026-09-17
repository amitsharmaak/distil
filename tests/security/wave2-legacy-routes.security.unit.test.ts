jest.mock("@/lib/auth/tenant-route", () => ({
  requireTenantRoute: jest.fn(),
  tenantRouteFailureResponse: jest.fn(() => Response.json({ error: "denied" }, { status: 401 })),
}));

jest.mock("@/lib/ai/preferences", () => ({
  getPreferences: jest.fn(),
  getAgentConfig: jest.fn(),
  saveAgentConfig: jest.fn(),
}));

jest.mock("@/lib/ai/prioritize", () => ({ reprioritize: jest.fn() }));
jest.mock("@/lib/ai/search", () => ({ hybridSearch: jest.fn() }));
jest.mock("@/lib/capture/composition", () => ({ composeCaptureRoutes: jest.fn() }));

import { requireTenantRoute, tenantRouteFailureResponse } from "@/lib/auth/tenant-route";
import { getAgentConfig, getPreferences, saveAgentConfig } from "@/lib/ai/preferences";
import { reprioritize } from "@/lib/ai/prioritize";
import { hybridSearch } from "@/lib/ai/search";
import { composeCaptureRoutes } from "@/lib/capture/composition";
import { NextRequest } from "next/server";
import { GET as feedbackGet } from "@/app/api/ai/feedback/[itemId]/route";
import { GET as preferencesGet, PUT as preferencesPut } from "@/app/api/ai/preferences/route";
import { POST as prioritizePost } from "@/app/api/ai/prioritize/route";
import { GET as summaryGet } from "@/app/api/ai/summary/[itemId]/route";
import { GET as itemsGet, POST as itemsPost } from "@/app/api/items/route";
import { DELETE as itemDelete, PATCH as itemPatch } from "@/app/api/items/[id]/route";

const tenantRoute = jest.mocked(requireTenantRoute);
const tenantFailure = jest.mocked(tenantRouteFailureResponse);
const mockedGetPreferences = jest.mocked(getPreferences);
const mockedGetAgentConfig = jest.mocked(getAgentConfig);
const mockedSaveAgentConfig = jest.mocked(saveAgentConfig);
const mockedReprioritize = jest.mocked(reprioritize);
const mockedHybridSearch = jest.mocked(hybridSearch);
const mockedComposeCaptureRoutes = jest.mocked(composeCaptureRoutes);
const createCapture = jest.fn();

const repositories = {
  items: {
    findById: jest.fn(),
    list: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  feedback: { findForItem: jest.fn() },
  summaries: { find: jest.fn(), findAll: jest.fn() },
};

describe("Wave 2 legacy route tenant boundaries", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    for (const group of Object.values(repositories)) {
      for (const method of Object.values(group)) method.mockReset();
    }
    tenantRoute.mockResolvedValue({ context: {} as never, repositories: repositories as never });
    tenantFailure.mockReturnValue(Response.json({ error: "denied" }, { status: 401 }));
    createCapture.mockReset();
    createCapture.mockResolvedValue({
      receipt: {
        id: "capture-1",
        normalizedUrl: "https://distil.example/article",
        status: "queued",
        retryable: true,
        attempts: 0,
        createdAt: "2026-09-08T00:00:00.000Z",
        updatedAt: "2026-09-08T00:00:00.000Z",
      },
      duplicate: false,
    });
    mockedComposeCaptureRoutes.mockResolvedValue({
      authenticate: async () => ({ kind: "session", context: {} }) as never,
      service: async () => ({ create: createCapture }) as never,
    });
  });

  it("conceals foreign feedback and returns owned feedback", async () => {
    repositories.items.findById
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ id: "own" });
    expect(
      (
        await feedbackGet(new Request("https://distil.example"), {
          params: Promise.resolve({ itemId: "foreign" }),
        })
      ).status
    ).toBe(404);
    repositories.feedback.findForItem.mockResolvedValue(undefined);
    const owned = await feedbackGet(new Request("https://distil.example"), {
      params: Promise.resolve({ itemId: "own" }),
    });
    expect(await owned.json()).toEqual({ feedback: null });
  });

  it("reads and updates tenant AI preferences", async () => {
    mockedGetPreferences.mockResolvedValue({ topics: [] } as never);
    mockedGetAgentConfig.mockResolvedValueOnce(undefined).mockResolvedValueOnce('{"mode":"calm"}');
    expect(
      await (await preferencesGet(new Request("https://distil.example"))).json()
    ).toMatchObject({
      config: null,
    });
    expect(
      await (await preferencesGet(new Request("https://distil.example"))).json()
    ).toMatchObject({
      config: { mode: "calm" },
    });
    const updated = await preferencesPut(
      new Request("https://distil.example", {
        method: "PUT",
        body: JSON.stringify({ mode: "focused" }),
      }) as never
    );
    expect(updated.status).toBe(200);
    expect(mockedSaveAgentConfig).toHaveBeenCalled();
  });

  it("reprioritizes through tenant context with safe default and explicit AI", async () => {
    mockedReprioritize.mockResolvedValue([]);
    await prioritizePost(
      new Request("https://distil.example", { method: "POST", body: "not-json" }) as never
    );
    expect(mockedReprioritize).toHaveBeenLastCalledWith({}, repositories, false);
    await prioritizePost(
      new Request("https://distil.example", {
        method: "POST",
        body: JSON.stringify({ useAI: true }),
      }) as never
    );
    expect(mockedReprioritize).toHaveBeenLastCalledWith({}, repositories, true);
  });

  it("conceals foreign summaries and supports typed and aggregate owned reads", async () => {
    repositories.items.findById
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ id: "own" })
      .mockResolvedValueOnce({ id: "own" });
    expect(
      (
        await summaryGet(new NextRequest("https://distil.example"), {
          params: Promise.resolve({ itemId: "foreign" }),
        })
      ).status
    ).toBe(404);
    repositories.summaries.find.mockResolvedValue(undefined);
    expect(
      await (
        await summaryGet(new NextRequest("https://distil.example?type=brief"), {
          params: Promise.resolve({ itemId: "own" }),
        })
      ).json()
    ).toEqual({ summary: null });
    repositories.summaries.findAll.mockResolvedValue([]);
    expect(
      await (
        await summaryGet(new NextRequest("https://distil.example"), {
          params: Promise.resolve({ itemId: "own" }),
        })
      ).json()
    ).toEqual({ summaries: [] });
  });

  it("maps legacy item-list filters into the tenant repository and tenant search", async () => {
    repositories.items.list.mockResolvedValue([]);
    const plain = await itemsGet(new NextRequest("https://distil.example/api/items"));
    expect(plain.status).toBe(200);
    expect(repositories.items.list).toHaveBeenCalledWith(
      expect.objectContaining({ includeProcessing: false })
    );

    mockedHybridSearch.mockResolvedValue([]);
    const searched = await itemsGet(
      new NextRequest(
        "https://distil.example/api/items?source=gmail&type=article&priority=high&unread=true&limit=5&sort=priority&q=tenant&includeProcessing=true"
      )
    );
    expect(searched.status).toBe(200);
    expect(mockedHybridSearch).toHaveBeenCalledWith(
      repositories,
      "tenant",
      expect.objectContaining({
        sourceType: "gmail",
        contentType: "article",
        priority: "high",
        isRead: false,
        limit: 5,
        sort: "priority",
        includeProcessing: true,
      })
    );
  });

  it("preserves item not-found concealment and successful tenant mutations", async () => {
    repositories.items.update.mockResolvedValueOnce(undefined).mockResolvedValueOnce({ id: "own" });
    const patchContext = { params: Promise.resolve({ id: "own" }) };
    expect(
      (
        await itemPatch(
          new NextRequest("https://distil.example/api/items/own", {
            method: "PATCH",
            body: JSON.stringify({ isRead: true }),
          }),
          patchContext
        )
      ).status
    ).toBe(404);
    expect(
      (
        await itemPatch(
          new NextRequest("https://distil.example/api/items/own", {
            method: "PATCH",
            body: JSON.stringify({ isRead: true }),
          }),
          patchContext
        )
      ).status
    ).toBe(200);

    repositories.items.delete.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    expect(
      (await itemDelete(new NextRequest("https://distil.example/api/items/own"), patchContext))
        .status
    ).toBe(404);
    expect(
      (await itemDelete(new NextRequest("https://distil.example/api/items/own"), patchContext))
        .status
    ).toBe(200);
  });

  it("rejects malformed item patches before tenant mutation", async () => {
    const context = { params: Promise.resolve({ id: "own" }) };
    expect(
      (
        await itemPatch(
          new NextRequest("https://distil.example/api/items/own", {
            method: "PATCH",
            body: "not-json",
          }),
          context
        )
      ).status
    ).toBe(400);
    expect(
      (
        await itemPatch(
          new NextRequest("https://distil.example/api/items/own", {
            method: "PATCH",
            body: "{}",
          }),
          context
        )
      ).status
    ).toBe(400);
  });

  it("fails closed on item route infrastructure errors", async () => {
    tenantRoute.mockRejectedValue(new Error("unavailable"));
    expect((await itemsGet(new NextRequest("https://distil.example/api/items"))).status).toBe(401);
    tenantFailure.mockReturnValue(Response.json({ error: "unavailable" }, { status: 503 }));
    expect((await itemsGet(new NextRequest("https://distil.example/api/items"))).status).toBe(500);
  });

  it("maps the legacy item POST into the durable tenant capture contract", async () => {
    const detailed = await itemsPost(
      new NextRequest("https://distil.example/api/items", {
        method: "POST",
        body: JSON.stringify({
          url: "https://distil.example/article",
          title: "Title",
          notes: "Notes",
          topics: ["AI"],
          priority: "high",
          sourceType: "browser-extension",
        }),
      })
    );
    expect(detailed.status).toBe(202);
    expect(createCapture).toHaveBeenCalledWith({
      url: "https://distil.example/article",
      title: "Title",
      notes: "Notes",
      topics: ["AI"],
      priority: "high",
      source: "browser-extension",
    });

    await itemsPost(
      new NextRequest("https://distil.example/api/items", {
        method: "POST",
        body: JSON.stringify({ url: "https://distil.example/minimal" }),
      })
    );
    expect(createCapture).toHaveBeenLastCalledWith(
      expect.objectContaining({ source: "web", topics: [], priority: "medium" })
    );

    const invalid = await itemsPost(
      new NextRequest("https://distil.example/api/items", {
        method: "POST",
        body: JSON.stringify({
          url: "https://distil.example/invalid",
          priority: "urgent",
        }),
      })
    );
    expect(invalid.status).toBe(400);
  });

  it("fails closed on legacy mutation infrastructure errors", async () => {
    tenantRoute.mockRejectedValue(new Error("unavailable"));
    tenantFailure.mockReturnValue(Response.json({ error: "unavailable" }, { status: 500 }));
    const context = { params: Promise.resolve({ id: "own" }) };
    expect(
      (
        await itemPatch(
          new NextRequest("https://distil.example/api/items/own", {
            method: "PATCH",
            body: JSON.stringify({ isRead: true }),
          }),
          context
        )
      ).status
    ).toBe(500);
    expect((await itemDelete(new NextRequest("https://distil.example"), context)).status).toBe(500);

    tenantFailure.mockReturnValue(Response.json({ error: "denied" }, { status: 401 }));
    expect(
      (
        await itemPatch(
          new NextRequest("https://distil.example/api/items/own", {
            method: "PATCH",
            body: JSON.stringify({ isRead: true }),
          }),
          context
        )
      ).status
    ).toBe(401);
    expect((await itemDelete(new NextRequest("https://distil.example"), context)).status).toBe(401);
  });

  it("fails closed when tenant preference persistence is unavailable", async () => {
    mockedSaveAgentConfig.mockRejectedValue(new Error("unavailable"));
    tenantFailure.mockReturnValue(Response.json({ error: "unavailable" }, { status: 503 }));
    const response = await preferencesPut(
      new Request("https://distil.example", {
        method: "PUT",
        body: JSON.stringify({ mode: "focused" }),
      }) as never
    );
    expect(response.status).toBe(500);
    tenantFailure.mockReturnValue(Response.json({ error: "denied" }, { status: 401 }));
    expect(
      (
        await preferencesPut(
          new Request("https://distil.example", {
            method: "PUT",
            body: JSON.stringify({ mode: "focused" }),
          }) as never
        )
      ).status
    ).toBe(401);
  });
});
