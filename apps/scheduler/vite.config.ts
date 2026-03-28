import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { TanStackRouterVite } from "@tanstack/router-plugin/vite"

export default defineConfig({
  plugins: [TanStackRouterVite(), react()],
  server: {
    port: 8001,
    host: "0.0.0.0",
  },
  envPrefix: "VITE_",
  build: {
    outDir: "dist",
    sourcemap: true,
  },
})
