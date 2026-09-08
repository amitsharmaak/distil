jest.mock("@/lib/auth/account-service", () => ({ resolveRequestAuthContext: jest.fn() }));
jest.mock("@/lib/auth/origin", () => ({ requireAllowedOrigin: jest.fn() }));
jest.mock("@/lib/database", () => ({ getTenantRepositories: jest.fn() }));
jest.mock("@/lib/knowledge/service", () => {
  const actual = jest.requireActual("@/lib/knowledge/service");
  return { ...actual, enqueueSummaryRegeneration: jest.fn() };
});

import { resolveRequestAuthContext } from "@/lib/auth/account-service";
import { AuthError } from "@/lib/auth/errors";
import { requireAllowedOrigin } from "@/lib/auth/origin";
import { getTenantRepositories } from "@/lib/database";
import { enqueueSummaryRegeneration } from "@/lib/knowledge/service";
import { POST } from "../route";

const auth = {
  userId: "11111111-1111-4111-8111-111111111111",
  actorKind: "user",
  actorId: "11111111-1111-4111-8111-111111111111",
  requestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
} as never;
const repositories = {} as never;
const routeContext = { params: Promise.resolve({ id: "item-1" }) };
const request = (body: unknown) =>
  new Request("https://distil.example/api/v1/items/item-1/summaries/regenerate", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://distil.example" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  jest.clearAllMocks();
  process.env.FEATURE_KNOWLEDGE_UI = "true";
  jest.mocked(resolveRequestAuthContext).mockResolvedValue(auth);
  jest.mocked(getTenantRepositories).mockResolvedValue(repositories);
  jest.mocked(enqueueSummaryRegeneration).mockResolvedValue({
    artifact: { id: "artifact", status: "pending" },
    jobId: "job",
  } as never);
});

describe("POST summary regeneration security", () => {
  afterAll(() => delete process.env.FEATURE_KNOWLEDGE_UI);

  it("requires allowed origin and an idempotency key before storage", async () => {
    jest.mocked(requireAllowedOrigin).mockImplementationOnce(() => {
      throw new AuthError("ORIGIN_NOT_ALLOWED", 403, "not allowed");
    });
    expect((await POST(request({ idempotencyKey: "key" }), routeContext)).status).toBe(403);
    expect(getTenantRepositories).not.toHaveBeenCalled();

    expect((await POST(request({ length: "brief" }), routeContext)).status).toBe(400);
    expect(getTenantRepositories).not.toHaveBeenCalled();
  });

  it("queues with caller context and its tenant repository", async () => {
    const response = await POST(
      request({ length: "detailed", idempotencyKey: "retry-1" }),
      routeContext
    );
    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({ jobId: "job" });
    expect(enqueueSummaryRegeneration).toHaveBeenCalledWith(
      auth,
      repositories,
      "item-1",
      expect.objectContaining({ idempotencyKey: "retry-1" })
    );
  });

  it("does not resolve tenant repositories while intelligence is disabled", async () => {
    delete process.env.FEATURE_KNOWLEDGE_UI;
    const response = await POST(request({ idempotencyKey: "key" }), routeContext);
    expect(response.status).toBe(503);
    expect(getTenantRepositories).not.toHaveBeenCalled();
  });
});
