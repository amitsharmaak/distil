import type { LinkedAccount } from "@/lib/auth/account";
import { userIdSchema } from "@/lib/contracts/tenant-context";

export interface AuthAccountRow {
  user_id: string;
  primary_email: string | null;
  status: LinkedAccount["status"];
}

/** Keep the PostgreSQL and Neon HTTP identity adapters on one row contract. */
export function mapAuthAccount(row: AuthAccountRow | undefined): LinkedAccount | undefined {
  if (!row) return undefined;
  const userId = userIdSchema.parse(row.user_id);
  return {
    userId,
    ...(row.primary_email ? { primaryEmail: row.primary_email } : {}),
    status: row.status,
  };
}
