const esbuild = require("esbuild")

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
  // Note: zod is bundled instead of external to avoid runtime issues on Heroku
]

esbuild
  .build({
    entryPoints: ["src/server.ts"],
    bundle: true,
    platform: "node",
    target: "node22",
    outfile: "dist/server.js",
    external,
    format: "cjs",
    sourcemap: true,
    minify: process.env.NODE_ENV === "production",
    logLevel: "info",
  })
  .catch(() => process.exit(1))
