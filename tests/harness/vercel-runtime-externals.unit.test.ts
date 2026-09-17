import { spawnSync } from "node:child_process";

/**
 * Vercel starts Next.js functions with `--no-experimental-require-module` and
 * `--no-experimental-detect-module` (observed on the Node 24.19 Lambda through
 * the Preview `/api/health` probe, 2026-09-17). Under those flags a CommonJS
 * `require()` of an ES module throws ERR_REQUIRE_ESM, which silently broke
 * article capture when `jsdom` moved to ESM-only dependencies (`parse5@8`,
 * `@exodus/bytes`). Every server-side package Next leaves external and loads
 * with `require()` at runtime must load under the same flags here.
 */
const RUNTIME_EXTERNALS = ["jsdom", "@mozilla/readability", "postgres", "pino", "better-sqlite3"];

const VERCEL_NODE_FLAGS = ["--no-experimental-require-module", "--no-experimental-detect-module"];

describe("runtime externals under Vercel's Node flags", () => {
  it.each(RUNTIME_EXTERNALS)("require(%s) succeeds with require(esm) disabled", (id) => {
    const result = spawnSync(
      process.execPath,
      [...VERCEL_NODE_FLAGS, "-e", `require(${JSON.stringify(id)})`],
      { cwd: process.cwd(), encoding: "utf8", timeout: 30_000 }
    );
    expect({ status: result.status, stderr: result.stderr.trim().slice(0, 600) }).toEqual({
      status: 0,
      stderr: "",
    });
  });
});
