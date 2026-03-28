const esbuild = require("esbuild")
const path = require("path")

// External packages that should not be bundled
// These are runtime dependencies that need to be installed in node_modules
const external = [
  // Socket.io and Redis
  "@socket.io/redis-adapter",
  "connect-redis",
  "redis",
  "socket.io",

  // Express and middleware
  "express",
  "express-session",
  "cookie-parser",
  "cors",

  // Utilities
  "node-cron",
  "mustache",
  "execa",
  "remeda",

  // Adapters
  "@spotify/web-api-ts-sdk",
  "node-internet-radio",
]

esbuild
  .build({
    entryPoints: ["src/server.ts"],
    bundle: true,
    platform: "node",
    target: "node22",
    outfile: "dist/server.js",
    external,
    // better-auth imports "zod"; esbuild resolves from paths under root
    // node_modules/... where zod is absent after npm workspaces + turbo prune
    // (zod stays under apps/api/node_modules). Alias to the real install.
    alias: {
      zod: path.dirname(
        require.resolve("zod/package.json", { paths: [__dirname] }),
      ),
    },
    format: "cjs",
    sourcemap: true,
    minify: process.env.NODE_ENV === "production",
    logLevel: "info",
  })
  .catch(() => process.exit(1))
