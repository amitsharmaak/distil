import { createSystemContext, userIdSchema } from "../src/lib/contracts/tenant-context";
import { getControlPlaneRepositories } from "../src/lib/database";

function usage(): never {
  throw new Error(
    "Usage: account:lifecycle suspend <user-uuid> <operator-actor-uuid> <reason> [--execute]"
  );
}

async function main(): Promise<void> {
  const [action, rawUserId, actorId, reason, flag] = process.argv.slice(2);
  if (action !== "suspend" || !rawUserId || !actorId || !reason) usage();
  const userId = userIdSchema.parse(rawUserId);
  const context = createSystemContext({
    actorKind: "system",
    actorId,
    requestId: crypto.randomUUID(),
  });
  if (flag !== "--execute") {
    process.stdout.write(
      `${JSON.stringify({ dryRun: true, action, userId, actorId, reason, effects: ["deny account access", "revoke capture/session metadata", "remove connector credentials/state", "cancel queued work", "write privileged audit"] })}\n`
    );
    return;
  }
  if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") {
    throw new Error("Production lifecycle mutations are not authorized by this command");
  }
  const repositories = await getControlPlaneRepositories(context);
  const changed = await repositories.lifecycle.suspendAccount({
    userId,
    actorId,
    requestId: context.requestId,
    reason,
    at: new Date().toISOString(),
  });
  process.stdout.write(`${JSON.stringify({ dryRun: false, action, userId, changed })}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Lifecycle command failed"}\n`);
  process.exitCode = 1;
});
