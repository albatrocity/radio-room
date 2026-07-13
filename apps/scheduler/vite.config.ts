import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { tanstackRouter } from "@tanstack/router-plugin/vite"

/** Docker bind mounts often don't propagate fs events (especially Docker Desktop). */
const pollFiles =
  process.env.VITE_DOCKER === "1" ||
  process.env.CHOKIDAR_USEPOLLING === "true"

export default defineConfig(({ mode }) => ({
  plugins: [tanstackRouter(), react()],
  server: {
    port: 8001,
    host: "0.0.0.0",
    // Bind mounts — without polling, saves on the host often never reach Chokidar inside the container.
    watch: pollFiles
      ? {
          usePolling: true,
          interval: 100,
          binaryInterval: 300,
        }
      : undefined,
  },
  envPrefix: "VITE_",
  build: {
    outDir: "dist",
    // Avoid Rollup/Chakra issues with dependency sourcemaps on CI (Netlify) and
    // keep deploy artifacts smaller; use `vite build --sourcemap` locally if needed.
    sourcemap: mode !== "production",
  },
}))
