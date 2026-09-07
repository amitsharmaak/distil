import { withRetry } from "../retry";

describe("withRetry", () => {
  it.each(["request timeout", "operation was aborted", "503 unavailable"])(
    "retries a transient provider failure: %s",
    async (message) => {
      const operation = jest
        .fn<Promise<string>, []>()
        .mockRejectedValueOnce(new Error(message))
        .mockResolvedValue("ok");

      await expect(
        withRetry(operation, { maxAttempts: 2, baseDelay: 0, maxDelay: 0 })
      ).resolves.toBe("ok");
      expect(operation).toHaveBeenCalledTimes(2);
    }
  );

  it("does not retry quota so the router can change models", async () => {
    const operation = jest.fn<Promise<string>, []>().mockRejectedValue(new Error("429 rate limit"));

    await expect(
      withRetry(operation, { maxAttempts: 2, baseDelay: 0, maxDelay: 0 })
    ).rejects.toThrow("429 rate limit");
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("does not retry a terminal provider failure", async () => {
    const operation = jest.fn<Promise<string>, []>().mockRejectedValue(new Error("invalid key"));

    await expect(
      withRetry(operation, { maxAttempts: 2, baseDelay: 0, maxDelay: 0 })
    ).rejects.toThrow("invalid key");
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
