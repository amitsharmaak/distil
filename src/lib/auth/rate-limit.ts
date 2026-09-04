import type { RateLimitRepository } from "@/lib/repositories/ports";
import { AuthError } from "@/lib/auth/errors";

export async function enforceRateLimit(
  repository: RateLimitRepository,
  input: { key: string; limit: number; windowSeconds: number; now?: Date }
): Promise<void> {
  const result = await repository.consume({
    key: input.key,
    limit: input.limit,
    windowSeconds: input.windowSeconds,
    now: (input.now ?? new Date()).toISOString(),
  });
  if (!result.allowed) throw new AuthError("RATE_LIMITED", 429, "Rate limit exceeded");
}
