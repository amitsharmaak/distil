import type { RateLimitRepository } from "@/lib/repositories/ports";
import { AuthError } from "@/lib/auth/errors";
import type { AuthContext } from "@/lib/contracts/tenant-context";

export async function enforceRateLimit(
  repository: RateLimitRepository,
  input: {
    context?: AuthContext;
    key: string;
    operation?: string;
    limit: number;
    windowSeconds: number;
    now?: Date;
  }
): Promise<void> {
  const result = await repository.consume({
    userId: input.context?.userId,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
    principalKind: input.context?.actorKind,
    principalId: input.context?.actorId,
    operation: input.operation,
    key: input.key,
    limit: input.limit,
    windowSeconds: input.windowSeconds,
    now: (input.now ?? new Date()).toISOString(),
  });
  if (!result.allowed) throw new AuthError("RATE_LIMITED", 429, "Rate limit exceeded");
}
