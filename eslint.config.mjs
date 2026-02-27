import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
// eslint-config-prettier disables ESLint rules that would conflict with
// Prettier's formatting. Always include it last so it overrides others.
import prettierConfig from "eslint-config-prettier";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Prettier compatibility: must come after all other rule configs.
  prettierConfig,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Never lint generated or local-only files:
    "data/**",
  ]),
]);

export default eslintConfig;
