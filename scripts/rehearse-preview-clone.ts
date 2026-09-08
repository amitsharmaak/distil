import fs from "node:fs/promises";
import path from "node:path";

import {
  buildPreviewCloneRehearsalPlan,
  previewCloneRehearsalInputSchema,
  verifyPreviewCloneEvidence,
} from "../src/lib/operations/preview-clone-rehearsal";

const USAGE = `Usage:
  npm run rehearse:preview-clone -- --input <metadata.json> [--output <plan.json>]
  npm run rehearse:preview-clone -- --input <metadata.json> --verify <evidence.json>

The default mode only builds a dry-run plan. It does not connect to or mutate any provider.`;

async function writePrivate(file: string, value: unknown): Promise<void> {
  const destination = path.resolve(file);
  await fs.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
  const temporary = `${destination}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  await fs.rename(temporary, destination);
  await fs.chmod(destination, 0o600);
}

function parseArgs(argv: readonly string[]) {
  let input: string | undefined;
  let output: string | undefined;
  let verify: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = () => {
      const next = argv[++index];
      if (!next || next.startsWith("--")) throw new Error(`${argument} requires a value`);
      return next;
    };
    if (argument === "--input") input = value();
    else if (argument === "--output") output = value();
    else if (argument === "--verify") verify = value();
    else if (argument === "--help" || argument === "-h") throw new Error(USAGE);
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (verify && output) throw new Error("--verify cannot be combined with --output");
  if (!input) throw new Error("--input is required");
  return { input, output, verify };
}

async function readJson(file: string): Promise<unknown> {
  return JSON.parse(await fs.readFile(path.resolve(file), "utf8")) as unknown;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const input = previewCloneRehearsalInputSchema.parse(await readJson(options.input!));
  if (options.verify) {
    const evidence = verifyPreviewCloneEvidence(await readJson(options.verify), input);
    process.stdout.write(
      `${JSON.stringify({ passed: true, runId: evidence.runId, releaseSha: evidence.releaseSha })}\n`
    );
    return;
  }
  const plan = buildPreviewCloneRehearsalPlan(input);
  if (options.output) await writePrivate(options.output, plan);
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "Preview clone rehearsal failed"}\n\n${USAGE}\n`
  );
  process.exitCode = 1;
});
