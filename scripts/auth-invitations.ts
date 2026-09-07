import { executeInvitationCommand } from "../src/lib/auth/invitations";
import { getAuthRepositoryPort } from "../src/lib/auth/repository-runtime";

function usage(): never {
  throw new Error(
    "Usage: auth:invite issue <email> <operator-actor-uuid> <reason> <app-origin> | revoke <invitation-uuid> <operator-actor-uuid> <reason>"
  );
}

async function main() {
  const [action, subject, actorId, reason, appOrigin] = process.argv.slice(2);
  if (!action || !subject || !actorId || !reason) usage();
  const command =
    action === "issue"
      ? {
          action,
          email: subject,
          issuedByActorId: actorId,
          reason,
          appOrigin: appOrigin ?? usage(),
        }
      : action === "revoke"
        ? { action, invitationId: subject, revokedByActorId: actorId, reason }
        : usage();
  const result = await executeInvitationCommand(command, await getAuthRepositoryPort());
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Invitation command failed"}\n`);
  process.exitCode = 1;
});
