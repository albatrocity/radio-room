import { existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

function moduleDir(): string {
  try {
    if (import.meta?.url) {
      return dirname(fileURLToPath(import.meta.url))
    }
  } catch {
    /* CJS bundle may lack import.meta */
  }
  const cjs = (globalThis as { __dirname?: string }).__dirname
  if (typeof cjs === "string") return cjs
  return process.cwd()
}

/**
 * Root of the bridge-daemon package (contains `static/` and `ui/`).
 *
 * - Dev (tsx ESM): `apps/bridge-daemon/`
 * - Packaged CJS: directory containing `daemon.cjs`
 * - Override: `BRIDGE_PACKAGE_ROOT` (local-remote supervisor)
 */
export function packageRoot(): string {
  const fromEnv = process.env.BRIDGE_PACKAGE_ROOT?.trim()
  if (fromEnv && existsSync(join(fromEnv, "static"))) return fromEnv

  const here = moduleDir()
  if (existsSync(join(here, "static"))) return here
  const parent = join(here, "..")
  if (existsSync(join(parent, "static"))) return parent
  return parent
}

export function staticDir(): string {
  return process.env.BRIDGE_STATIC_DIR?.trim() || join(packageRoot(), "static")
}

export function uiHtmlPath(): string {
  return process.env.BRIDGE_UI_HTML?.trim() || join(packageRoot(), "ui", "index.html")
}
