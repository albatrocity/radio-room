module.exports = {
  env: {
    node: true,
  },
  extends: ["crema"],
  rules: {
    "@typescript-eslint/no-non-null-assertion": "off",
    "@typescript-eslint/no-explicit-any": "off",
    "import/order": [
      "error",
      {
        alphabetize: { caseInsensitive: true, order: "asc" },
        groups: [
          "builtin",
          "external",
          "internal",
          "parent",
          "sibling",
          "index",
          "object",
          "unknown",
        ],
        "newlines-between": "always",
      },
    ],
  },
  parser: "@typescript-eslint/parser",
}
