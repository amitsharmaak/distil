import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 3100;

function parsePort(value: string | undefined): number {
  const port = value === undefined ? DEFAULT_PORT : Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`Invalid DISTIL_E2E_PORT: ${value}`);
  }
  return port;
}

export const e2eHost = process.env.DISTIL_E2E_HOST ?? DEFAULT_HOST;
export const e2ePort = parsePort(process.env.DISTIL_E2E_PORT);
export const e2eBaseUrl = `http://${e2eHost}:${e2ePort}`;

/**
 * Command consumed by Playwright's webServer fixture. Keeping the launcher in
 * the test tree lets it own isolation and signal forwarding rather than
 * teaching the application about test-only lifecycle concerns.
 */
export const nextServerCommand = "npm exec -- tsx tests/support/browser/server.ts --start";

function startServer(): void {
  const workingDirectory = mkdtempSync(join(tmpdir(), "distil-e2e-"));
  let stopping = false;
  const production = process.env.DISTIL_E2E_PRODUCTION === "1";

  const cleanUp = () => {
    rmSync(workingDirectory, { recursive: true, force: true });
  };

  const child: ChildProcess = spawn(
    "npm",
    [
      "run",
      production ? "start" : "dev",
      "--",
      "--hostname",
      e2eHost,
      "--port",
      String(e2ePort),
      // Webpack tolerates the shared node_modules symlink used by isolated
      // agent worktrees; Turbopack intentionally rejects paths outside root.
      ...(production ? [] : ["--webpack"]),
    ],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ANTHROPIC_API_KEY: "",
        DB_PATH: join(workingDirectory, "distil.sqlite"),
        GEMINI_API_KEY: "",
        GOOGLE_CLIENT_ID: "",
        GOOGLE_CLIENT_SECRET: "",
        NEXT_PUBLIC_API_BASE_URL: e2eBaseUrl,
        NEXT_TELEMETRY_DISABLED: "1",
        OPENAI_API_KEY: "",
        SLACK_CLIENT_ID: "",
        SLACK_CLIENT_SECRET: "",
        SYNC_INTERVAL_HOURS: "0",
      },
      stdio: "inherit",
    }
  );

  const stop = (signal: NodeJS.Signals) => {
    if (stopping) return;
    stopping = true;
    child.kill(signal);
  };

  process.once("SIGINT", () => stop("SIGINT"));
  process.once("SIGTERM", () => stop("SIGTERM"));
  process.once("exit", cleanUp);

  child.once("error", (error) => {
    console.error("Failed to launch the Next.js E2E server", error);
    cleanUp();
    process.exitCode = 1;
  });

  child.once("exit", (code, signal) => {
    cleanUp();
    if (signal !== null && stopping) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 1);
  });
}

if (process.argv.includes("--start")) {
  startServer();
}
