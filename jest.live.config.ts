import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: {
          module: "commonjs",
          moduleResolution: "node",
          jsx: "react-jsx",
        },
      },
    ],
  },
  collectCoverage: false,
  testMatch: ["**/*.live.test.ts?(x)"],
  testPathIgnorePatterns: ["/node_modules/", "/.next/", "/tests/e2e/", "/tests/extension/"],
};

export default config;
