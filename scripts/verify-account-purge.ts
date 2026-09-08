import postgres from "postgres";

import { userIdSchema } from "../src/lib/contracts/tenant-context";
import { tenantProtectedTables } from "../src/lib/postgres/tenant-migration/manifest";

function usage(): never {
  throw new Error("Usage: account:verify-purge <user-uuid> <deletion-uuid>");
}

async function main(): Promise<void> {
  const [rawUserId, deletionId] = process.argv.slice(2);
  if (!rawUserId || !deletionId) usage();
  const userId = userIdSchema.parse(rawUserId);
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/iu.test(deletionId)) usage();
  const databaseUrl = process.env.DATABASE_CONTROL_PLANE_URL;
  if (!databaseUrl) throw new Error("DATABASE_CONTROL_PLANE_URL is required");
  const sql = postgres(databaseUrl, { max: 1, prepare: false });
  try {
    const counts: Record<string, number> = {};
    await sql.begin("read only", async (transaction) => {
      for (const table of tenantProtectedTables) {
        const owner = table.ownerColumn === "id" ? "id" : "user_id";
        const rows = await transaction.unsafe<Array<{ count: number }>>(
          `SELECT count(*)::integer AS count FROM public."${table.table}" WHERE "${owner}"=$1::uuid`,
          [userId]
        );
        counts[table.table] = Number(rows[0]?.count ?? 0);
      }
    });
    const [tombstone] = await sql<
      Array<{
        present: boolean;
        zero_row_count: number;
        zero_object_count: number;
        auth_purged: boolean;
      }>
    >`
      SELECT true AS present,zero_row_count,zero_object_count,auth_purged
      FROM public.account_deletion_tombstones WHERE deletion_id=${deletionId}::uuid`;
    const remainingRows = Object.values(counts).reduce((sum, count) => sum + count, 0);
    const passed =
      remainingRows === 0 &&
      tombstone?.present === true &&
      Number(tombstone.zero_row_count) === 0 &&
      Number(tombstone.zero_object_count) === 0 &&
      tombstone.auth_purged === true;
    process.stdout.write(
      `${JSON.stringify({ passed, deletionId, remainingRows, counts, tombstone: tombstone ?? null })}\n`
    );
    if (!passed) process.exitCode = 1;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Purge verification failed"}\n`);
  process.exitCode = 1;
});
