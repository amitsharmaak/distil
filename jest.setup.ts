/**
 * Jest global setup file.
 *
 * Runs after the Jest test framework is installed but before each test file.
 * Imports @testing-library/jest-dom so that custom DOM matchers like
 * `toBeInTheDocument`, `toHaveTextContent`, etc. are available in all tests.
 */
import "@testing-library/jest-dom";
