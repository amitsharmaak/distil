import type { Config } from "jest";
import baseConfig from "./jest.config";

const config: Config = {
  ...baseConfig,
  collectCoverage: false,
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  testMatch: ["**/*.live.test.ts?(x)"],
  testPathIgnorePatterns: ["/node_modules/", "/.next/", "/tests/e2e/", "/tests/extension/"],
};

export default config;
