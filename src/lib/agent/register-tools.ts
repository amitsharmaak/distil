/**
 * The legacy global tool registry had ambient database access. It is disabled
 * until each registration is supplied a tenant capability at the call site.
 */
import type { AuthContext } from "@/lib/contracts/tenant-context";
import type { RepositorySet } from "@/lib/repositories/ports";

export function registerAllTools(_context: AuthContext, _repositories: RepositorySet): void {
  void _context;
  void _repositories;
  // Agent chat uses the tenant-bound RAG route directly. Re-enabling tools
  // requires registrations that close over this exact tenant capability.
}
