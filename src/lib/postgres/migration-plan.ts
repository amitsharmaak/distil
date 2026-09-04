/** Produces the deterministic, ledger-aware migration order for a release. */
export function planMigrations(
  directoryEntries: readonly string[],
  appliedNames: ReadonlySet<string>
): string[] {
  return directoryEntries
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .filter((file) => !appliedNames.has(file));
}
