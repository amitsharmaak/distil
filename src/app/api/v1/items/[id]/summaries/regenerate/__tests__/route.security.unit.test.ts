jest.mock("@/lib/auth/route-helpers", () => ({ requireSessionMutation: jest.fn() }));
jest.mock("@/lib/database", () => ({ getRepositorySet: jest.fn() }));
jest.mock("@/lib/knowledge/service", () => {
  const actual = jest.requireActual("@/lib/knowledge/service");
  return { ...actual, enqueueSummaryRegeneration: jest.fn() };
});

import { AuthError } from "@/lib/auth/errors";
import { requireSessionMutation } from "@/lib/auth/route-helpers";
import { getRepositorySet } from "@/lib/database";
import { enqueueSummaryRegeneration } from "@/lib/knowledge/service";
import { POST } from "../route";

const context = { params: Promise.resolve({ id: "item-1" }) };
const request = (body: unknown) =>
  new Request("https://distil.example/api/v1/items/item-1/summaries/regenerate", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://distil.example" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(requireSessionMutation).mockResolvedValue();
  jest.mocked(getRepositorySet).mockResolvedValue({} as never);
  jest.mocked(enqueueSummaryRegeneration).mockResolvedValue({
    artifact: { id: "artifact", status: "pending" },
    jobId: "job",
  } as never);
});

describe("POST summary regeneration security", () => {
  it("requires origin/session and an idempotency key", async () => {
    jest
      .mocked(requireSessionMutation)
      .mockRejectedValueOnce(new AuthError("ORIGIN_NOT_ALLOWED", 403, "not allowed"));
    expect((await POST(request({ idempotencyKey: "key" }), context)).status).toBe(403);
    expect(getRepositorySet).not.toHaveBeenCalled();

    expect((await POST(request({ length: "brief" }), context)).status).toBe(400);
    expect(getRepositorySet).not.toHaveBeenCalled();
  });

  it("queues accepted regeneration requests", async () => {
    const response = await POST(
      request({ length: "detailed", idempotencyKey: "retry-1" }),
      context
    );
    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({ jobId: "job" });
  });
});
