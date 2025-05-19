import eslintJs from "@eslint/js"
import eslintConfigPrettier from "eslint-config-prettier"
import turboPlugin from "eslint-plugin-turbo"
import * as tseslint from "typescript-eslint"

/**
 * A shared ESLint configuration for the repository.
 *
 * @type {import("eslint").Linter.FlatConfig[]}
 * */
const config = [
  // Use eslint.configs if available, otherwise fall back
  (eslintJs?.configs?.recommended) || { linterOptions: { reportUnusedDisableDirectives: true } },
  // Spread typescript-eslint configs cautiously
  ...(tseslint?.configs?.recommended ? [tseslint.configs.recommended] : []),
  // Include the prettier config
  eslintConfigPrettier,
  {
    plugins: {
      turbo: turboPlugin,
    },
    rules: {
      "turbo/no-undeclared-env-vars": "warn",
    },
  },
  {
    plugins: {},
  },
  {
    ignores: ["dist/**", "node_modules/**", ".turbo/**", "build/**"],
  },
]

export default config
