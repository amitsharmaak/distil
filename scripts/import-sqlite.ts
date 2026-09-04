import { resolve } from "node:path";
import { formatImportResult, importSqlite } from "../src/lib/import/sqlite-importer";

function readArguments(args: string[]): { sourcePath: string; execute: boolean } {
  const execute = args.includes("--execute");
  const positional = args.filter((arg) => !arg.startsWith("--"));
  if (positional.length > 1) {
    throw new Error("Usage: tsx scripts/import-sqlite.ts [sqlite-path] [--execute]");
  }
  return { sourcePath: resolve(positional[0] ?? "data/distil.db"), execute };
}

async function main() {
  const options = readArguments(process.argv.slice(2));
  const result = await importSqlite(options);
  console.log(formatImportResult(result));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
