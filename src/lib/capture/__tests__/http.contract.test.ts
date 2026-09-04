import type { AuthPrincipal } from "@/lib/contracts/capture";
import { FakeCaptureDispatcher } from "@/lib/queue/dispatchers";
import {
  createCaptureCollectionHandlers,
  createCaptureResourceHandlers,
  createCaptureRetryHandlers,
} from "../http";
import { CaptureService } from "../service";
import { captureRecord, MemoryCaptureRepository, publicDns } from "./fixtures";

const principal: AuthPrincipal = { kind: "session" };

function setup(records = [captureRecord()]) {
  const dispatcher = new FakeCaptureDispatcher();
  const service = new CaptureService({
    captures: new MemoryCaptureRepository(records),
    dispatcher,
    resolve: publicDns,
    id: () => "10000000-0000-4000-8000-000000000002",
  });
  return { service, dispatcher, authenticate: jest.fn().mockResolvedValue(principal) };
}

describe("capture HTTP contracts", () => {
  it("POST returns 401 before parsing an unauthenticated request", async () => {
    const dependencies = setup();
    dependencies.authenticate.mockResolvedValue(undefined);
    const response = await createCaptureCollectionHandlers(dependencies).POST(
      new Request("http://localhost/api/v1/captures", { method: "POST", body: "not-json" })
    );
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "UNAUTHORIZED" } });
  });

  it("POST returns 400 INVALID_REQUEST for malformed JSON and invalid schemas", async () => {
    const handler = createCaptureCollectionHandlers(setup()).POST;
    const malformed = await handler(
      new Request("http://localhost/api/v1/captures", { method: "POST", body: "{" })
    );
    expect(malformed.status).toBe(400);
    const invalid = await handler(
      new Request("http://localhost/api/v1/captures", {
        method: "POST",
        body: JSON.stringify({ url: "https://example.com", source: "slack", unknown: true }),
      })
    );
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toMatchObject({ error: { code: "INVALID_REQUEST" } });
  });

  it("POST returns 202 only after a new capture is published", async () => {
    const response = await createCaptureCollectionHandlers(setup([])).POST(
      new Request("http://localhost/api/v1/captures", {
        method: "POST",
        body: JSON.stringify({ url: "https://example.com/new", source: "ios-shortcut" }),
      })
    );
    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      duplicate: false,
      receipt: { status: "queued" },
    });
  });

  it("POST returns 200 for an active or ready duplicate", async () => {
    const response = await createCaptureCollectionHandlers(setup()).POST(
      new Request("http://localhost/api/v1/captures", {
        method: "POST",
        body: JSON.stringify({ url: "https://example.com/article", source: "web" }),
      })
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ duplicate: true });
  });

  it("POST returns 422 UNSAFE_URL for private targets", async () => {
    const response = await createCaptureCollectionHandlers(setup([])).POST(
      new Request("http://localhost/api/v1/captures", {
        method: "POST",
        body: JSON.stringify({ url: "http://127.0.0.1/admin", source: "web" }),
      })
    );
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "UNSAFE_URL" } });
  });

  it("POST returns 503 QUEUE_UNAVAILABLE with the durable failed receipt", async () => {
    const dependencies = setup([]);
    dependencies.dispatcher.failure = new Error("offline");
    const response = await createCaptureCollectionHandlers(dependencies).POST(
      new Request("http://localhost/api/v1/captures", {
        method: "POST",
        body: JSON.stringify({ url: "https://example.com/new", source: "web" }),
      })
    );
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "QUEUE_UNAVAILABLE" },
      receipt: { status: "failed", retryable: true },
    });
  });

  it("GET lists receipts and validates limit", async () => {
    const handler = createCaptureCollectionHandlers(setup()).GET;
    const response = await handler(new Request("http://localhost/api/v1/captures?limit=25"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      receipts: [{ id: captureRecord().id }],
    });
    expect((await handler(new Request("http://localhost/api/v1/captures?limit=0"))).status).toBe(
      400
    );
  });

  it("GET by id returns 200 or 404 CAPTURE_NOT_FOUND", async () => {
    const handler = createCaptureResourceHandlers(setup()).GET;
    expect(
      (
        await handler(new Request("http://localhost"), {
          params: Promise.resolve({ id: captureRecord().id }),
        })
      ).status
    ).toBe(200);
    const missing = await handler(new Request("http://localhost"), {
      params: Promise.resolve({ id: "missing" }),
    });
    expect(missing.status).toBe(404);
    await expect(missing.json()).resolves.toMatchObject({ error: { code: "CAPTURE_NOT_FOUND" } });
  });

  it("POST retry returns 202 or 409 CAPTURE_NOT_RETRYABLE", async () => {
    const retryable = captureRecord({ status: "failed", retryable: true });
    const accepted = await createCaptureRetryHandlers(setup([retryable])).POST(
      new Request("http://localhost", { method: "POST" }),
      { params: Promise.resolve({ id: retryable.id }) }
    );
    expect(accepted.status).toBe(202);
    const conflict = await createCaptureRetryHandlers(setup()).POST(
      new Request("http://localhost", { method: "POST" }),
      { params: Promise.resolve({ id: captureRecord().id }) }
    );
    expect(conflict.status).toBe(409);
    await expect(conflict.json()).resolves.toMatchObject({
      error: { code: "CAPTURE_NOT_RETRYABLE" },
    });
  });

  test.each([
    ["RATE_LIMITED", 429],
    ["ORIGIN_NOT_ALLOWED", 403],
  ])("maps auth error %s to HTTP %s", async (code, status) => {
    const dependencies = setup();
    dependencies.authenticate.mockRejectedValue({ code });
    const response = await createCaptureCollectionHandlers(dependencies).GET(
      new Request("http://localhost/api/v1/captures")
    );
    expect(response.status).toBe(status);
  });
});
