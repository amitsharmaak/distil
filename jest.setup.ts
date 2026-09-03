/**
 * Jest global setup file.
 *
 * Runs after the Jest test framework is installed but before each test file.
 * Imports @testing-library/jest-dom so that custom DOM matchers like
 * `toBeInTheDocument`, `toHaveTextContent`, etc. are available in all tests.
 */
import "@testing-library/jest-dom";

if (typeof window === "undefined" && process.env.RUN_LIVE_CONNECTION_TESTS !== "1") {
  // Node suites use strict MSW interception. Requiring after the test
  // environment is ready keeps jsdom free of Node-only fetch polyfills.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("./tests/support/msw-jest");
} else if (typeof window !== "undefined" && process.env.RUN_LIVE_CONNECTION_TESTS !== "1") {
  // Component suites do not need a network implementation. Failing closed
  // makes any accidental request explicit while allowing tests to install a
  // local mock when network behavior is the subject of the test.
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    writable: true,
    value: jest.fn((input: RequestInfo | URL) =>
      Promise.reject(new Error(`Unhandled component-test request: ${String(input)}`))
    ),
  });
}
