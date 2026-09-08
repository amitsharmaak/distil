jest.mock("@/lib/auth/account-service", () => ({ resolveRequestAuthContext: jest.fn() }));
jest.mock("@/lib/database", () => ({ getTenantRepositories: jest.fn() }));

import { resolveRequestAuthContext } from "@/lib/auth/account-service";
import { getTenantRepositories } from "@/lib/database";
import { GET } from "../route";

const auth = {
  userId: "11111111-1111-4111-8111-111111111111",
  actorKind: "user",
  actorId: "11111111-1111-4111-8111-111111111111",
  requestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
} as never;

describe("GET item intelligence feature gate", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(resolveRequestAuthContext).mockResolvedValue(auth);
  });

  afterEach(() => delete process.env.FEATURE_KNOWLEDGE_UI);

  it("authenticates, then stops before tenant repository access when disabled", async () => {
    const response = await GET(
      new Request("https://distil.example/api/v1/items/item-1/intelligence"),
      { params: Promise.resolve({ id: "item-1" }) }
    );
    expect(response.status).toBe(503);
    expect(resolveRequestAuthContext).toHaveBeenCalled();
    expect(getTenantRepositories).not.toHaveBeenCalled();
  });
});
