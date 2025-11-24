import { defineConfig } from "vitest/config"
import { resolve } from "path"

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    mockReset: true,
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./"),
    },
  },
})
