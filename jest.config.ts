import type { Config } from "jest";

/**
 * Jest configuration for the PIA project.
 *
 * - Default test environment: "node" (for API route and DB tests).
 * - React component tests override to jsdom via the
 *   `@jest-environment jsdom` docblock at the top of each test file.
 * - ts-jest transforms TypeScript; module settings are overridden to
 *   CommonJS so Jest (which runs in Node.js) can resolve imports.
 * - The "@/" path alias mirrors tsconfig.json paths.
 */
const config: Config = {
  // Use ts-jest preset so TypeScript is handled out of the box.
  preset: "ts-jest",

  // Default environment for server-side tests (API routes, DB helpers).
  // Component test files override this with `@jest-environment jsdom`.
  testEnvironment: "node",

  // Run this file after the test environment is set up so jest-dom
  // custom matchers (e.g. toBeInTheDocument) are available in all tests.
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],

  // Mirror the "@/*" path alias from tsconfig.json so imports like
  // `import { config } from "@/lib/config"` resolve correctly in tests.
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },

  // Configure ts-jest to compile TypeScript.
  // We override module + moduleResolution to CommonJS/Node so that Jest
  // (a CommonJS environment) can require() the compiled output.
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: {
          // CommonJS output is required for Jest to work with require().
          module: "commonjs",
          moduleResolution: "node",
          // Keep JSX transform as-is from tsconfig.json.
          jsx: "react-jsx",
        },
      },
    ],
  },

  // Only pick up files in __tests__ directories or with .test.ts(x) suffix.
  testMatch: ["**/__tests__/**/*.test.ts?(x)", "**/*.test.ts?(x)"],

  // Paths to ignore when discovering test files.
  testPathIgnorePatterns: ["/node_modules/", "/.next/"],

  // Show a coverage summary when running `npm run test:coverage`.
  coverageReporters: ["text", "lcov"],

  // Collect coverage from source files, excluding generated/config files.
  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    "!src/**/*.d.ts",
    "!src/app/layout.tsx",
    "!src/lib/mock-data.ts",
  ],
};

export default config;
