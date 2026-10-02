import path from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig, loadEnv } from "vite"
import react from "@vitejs/plugin-react"
import { siteAssetsPlugin } from "./vite/siteAssetsPlugin"
import { tripMapFilesPlugin } from "./vite/tripMapFilesPlugin"

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

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, __dirname, ""), ...process.env }
  return {
    plugins: [
      react(),
      tripMapFilesPlugin(path.join(__dirname, "maps")),
      siteAssetsPlugin({
        bucket: env.ASSET_S3_BUCKET || "listening-room-assets",
        cdnBaseUrl: env.VITE_ASSET_CDN_BASE_URL || "https://cdn.listeningroom.club",
        region: env.AWS_REGION || "us-east-1",
        profile: env.AWS_PROFILE || undefined,
      }),
    ],
    /** Linked workspace TS sources — skip pre-bundle cache so edits invalidate the module graph. */
    optimizeDeps: {
      /** `@repo/model-viewer` loads these lazily; discovering them mid-session reloads the page. */
      include: [
        "three",
        "three/addons/controls/OrbitControls.js",
        "three/addons/environments/RoomEnvironment.js",
        "three/addons/loaders/GLTFLoader.js",
      ],
      exclude: [
        "@repo/plugin-item-shops",
        "@repo/plugin-base",
        "@repo/game-logic",
        "@repo/types",
        "@repo/factories",
        "@repo/road-trip-map",
        "@repo/model-viewer",
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
  }
})
