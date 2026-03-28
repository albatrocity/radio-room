import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { tanstackRouter } from "@tanstack/router-plugin/vite"

export default defineConfig(({ mode }) => ({
  plugins: [tanstackRouter(), react()],
  server: {
    port: 8001,
    host: "0.0.0.0",
  },
  envPrefix: "VITE_",
  build: {
    outDir: "dist",
    // Avoid Rollup/Chakra issues with dependency sourcemaps on CI (Netlify) and
    // keep deploy artifacts smaller; use `vite build --sourcemap` locally if needed.
    sourcemap: mode !== "production",
  },
}))
