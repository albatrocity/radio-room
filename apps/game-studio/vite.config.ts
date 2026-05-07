import path from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
/** Monorepo root (parent of `apps/`). */
const repoRoot = path.resolve(__dirname, "../..")

/**
 * Workspace packages resolve to symlinks under `node_modules/@repo/*`. Vite's default watcher
 * ignores `node_modules`, so edits there never trigger HMR. Allow watching `@repo/*` trees.
 */
function watchWorkspaceLinkedPackages(): (filePath: string) => boolean {
  return (filePath: string) => {
    const n = filePath.split(path.sep).join("/")
    if (n.includes("/node_modules/")) {
      return !n.includes("/node_modules/@repo/")
    }
    return false
  }
}

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  /** Linked workspace TS sources — skip pre-bundle cache so edits invalidate the module graph. */
  optimizeDeps: {
    exclude: [
      "@repo/plugin-item-shops",
      "@repo/plugin-base",
      "@repo/game-logic",
      "@repo/types",
      "@repo/factories",
    ],
  },
  server: {
    port: 8005,
    host: "0.0.0.0",
    fs: {
      allow: [repoRoot],
    },
    watch: {
      ignored: watchWorkspaceLinkedPackages(),
      ...(process.env.CHOKIDAR_USEPOLLING === "true" ? { usePolling: true, interval: 100 } : {}),
    },
  },
  envPrefix: "VITE_",
  build: {
    outDir: "dist",
    sourcemap: mode !== "production",
  },
}))
