jest.mock("@/lib/auth/route-helpers", () => ({ requireRequestSession: jest.fn() }));
jest.mock("@/lib/database", () => ({ getRepositorySet: jest.fn() }));

import { requireRequestSession } from "@/lib/auth/route-helpers";
import { getRepositorySet } from "@/lib/database";
import { GET } from "../route";

describe("GET item intelligence feature gate", () => {
  afterEach(() => delete process.env.FEATURE_KNOWLEDGE_UI);

  it("authenticates, then stops before repository access when disabled", async () => {
    jest.mocked(requireRequestSession).mockResolvedValue();
    const response = await GET(
      new Request("https://distil.example/api/v1/items/item-1/intelligence"),
      {
        params: Promise.resolve({ id: "item-1" }),
      }
    );
    expect(response.status).toBe(503);
    expect(requireRequestSession).toHaveBeenCalled();
    expect(getRepositorySet).not.toHaveBeenCalled();
  });
});
