// Jest loads TypeScript configuration through ts-node and requires the explicit
// extension here; the application compiler intentionally disallows it elsewhere.
// @ts-expect-error -- runtime config import, not application code
import baseConfig from "./jest.config.ts";
import type { Config } from "jest";

const config: Config = {
  ...baseConfig,
  // Coverage is produced by one Jest invocation so deterministic and real
  // PostgreSQL integration executions contribute to the same Istanbul map.
  testPathIgnorePatterns: [
    "/node_modules/",
    "/.next/",
    "\\.live\\.test\\.[jt]sx?$",
    "\\.integration\\.test\\.[jt]sx?$",
    "\\.sqlite-integration\\.test\\.[jt]sx?$",
    "/tests/e2e/",
    "/tests/extension/",
  ],
  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    "!src/**/*.d.ts",
    "!src/**/__tests__/**",
    "!src/**/*.test.{ts,tsx}",
    "!src/lib/mock-data.ts",
    "!src/lib/contracts/**",
    "!src/lib/repositories/ports.ts",
  ],
  coverageReporters: ["text", "lcov", "json"],
};

export default config;
