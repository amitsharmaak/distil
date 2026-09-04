jest.mock("@/lib/database", () => ({ getRepositorySet: jest.fn() }));
jest.mock("@/lib/queue/dispatchers", () => ({ createVercelCaptureDispatcher: jest.fn() }));

import { getRepositorySet } from "@/lib/database";
import { createVercelCaptureDispatcher } from "@/lib/queue/dispatchers";
import { composeCaptureRoutes } from "../composition";

describe("capture route composition", () => {
  it("composes repository-backed service with a fail-closed auth seam", async () => {
    const captures = {};
    const dispatcher = { dispatch: jest.fn() };
    (getRepositorySet as jest.Mock).mockResolvedValue({ captures });
    (createVercelCaptureDispatcher as jest.Mock).mockResolvedValue(dispatcher);
    const composition = await composeCaptureRoutes();
    expect(composition.service).toBeDefined();
    await expect(
      composition.authenticate(new Request("http://localhost"))
    ).resolves.toBeUndefined();
    expect(getRepositorySet).toHaveBeenCalledTimes(1);
    expect(createVercelCaptureDispatcher).toHaveBeenCalledTimes(1);
  });
});
