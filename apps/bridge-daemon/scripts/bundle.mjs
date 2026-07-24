#!/usr/bin/env node
/**
 * Bundle bridge-daemon for DJ Mac pack (no monorepo / tsx on the target).
 * Output: dist-bundle/daemon.cjs + static/ + ui/
 * puppeteer-core is installed into dist-bundle by pack-dj-mac.sh (or npm run bundle:deps).
 */
import * as esbuild from "esbuild"
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, "..")
const outDir = join(root, "dist-bundle")

rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

await esbuild.build({
  entryPoints: [join(root, "src/index.ts")],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  outfile: join(outDir, "daemon.cjs"),
  external: ["puppeteer-core"],
  banner: {
    js: `globalThis.__dirname = typeof __dirname !== "undefined" ? __dirname : require("path").dirname(__filename);`,
  },
  logLevel: "info",
})

cpSync(join(root, "static"), join(outDir, "static"), { recursive: true })
cpSync(join(root, "ui"), join(outDir, "ui"), { recursive: true })

writeFileSync(
  join(outDir, "package.json"),
  JSON.stringify(
    {
      name: "bridge-daemon-bundle",
      private: true,
      type: "commonjs",
      main: "daemon.cjs",
      dependencies: {
        "puppeteer-core": "^24.8.2",
      },
      engines: { node: ">=22.16.0" },
    },
    null,
    2,
  ) + "\n",
)

console.log(`[bundle] wrote ${outDir}`)
console.log(`[bundle] next: (cd ${outDir} && npm install --omit=dev)`)
