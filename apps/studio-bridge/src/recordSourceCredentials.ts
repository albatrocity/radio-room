import { existsSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { parseEnv } from "node:util"

/**
 * Credentials for the record picker's lookups (ADR 0216), from what a dev
 * machine already has, so the picker works without a studio-bridge `.env`:
 *
 * - Spotify: `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` from the process,
 *   else the repo-root `.env` (only those two keys; the rest, like `PORT`,
 *   would move the bridge).
 * - Navidrome: `NAVIDROME_URL` / `NAVIDROME_USER` / `NAVIDROME_PASSWORD`, else
 *   the Media Bridge daemon's `~/.config/listening-room-bridge/config.json`.
 */

const SPOTIFY_KEYS = ["SPOTIFY_CLIENT_ID", "SPOTIFY_CLIENT_SECRET"] as const

/** The repo root: the nearest ancestor holding `turbo.json`. */
function repoRoot(from: string): string | null {
  let dir = from
  for (;;) {
    if (existsSync(join(dir, "turbo.json"))) return dir
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

function readEnvFile(path: string): Record<string, string> {
  try {
    return parseEnv(readFileSync(path, "utf8")) as Record<string, string>
  } catch {
    return {}
  }
}

/**
 * Copy the Spotify app keys from the repo-root `.env` into `process.env` when
 * they aren't set already. `@repo/spotify-catalog` reads them from there.
 */
export function loadSpotifyCredentials(
  rootEnvPath: string | null = rootEnvFile(),
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (SPOTIFY_KEYS.every((key) => env[key])) return
  if (!rootEnvPath) return
  const file = readEnvFile(rootEnvPath)
  for (const key of SPOTIFY_KEYS) {
    if (!env[key] && file[key]) env[key] = file[key]
  }
}

function rootEnvFile(): string | null {
  const root = repoRoot(dirname(fileURLToPath(import.meta.url)))
  return root ? join(root, ".env") : null
}

export type NavidromeConfig = { url: string; user: string; password: string }

export const DAEMON_CONFIG_PATH = join(homedir(), ".config", "listening-room-bridge", "config.json")

/** Navidrome from the env, else from the bridge daemon's config. */
export function navidromeConfig(
  env: NodeJS.ProcessEnv = process.env,
  daemonConfigPath: string = DAEMON_CONFIG_PATH,
): NavidromeConfig | null {
  const fromEnv = complete(env.NAVIDROME_URL, env.NAVIDROME_USER, env.NAVIDROME_PASSWORD)
  if (fromEnv) return fromEnv
  try {
    const config = JSON.parse(readFileSync(daemonConfigPath, "utf8")) as {
      navidrome?: { url?: string; username?: string; password?: string }
    }
    const n = config.navidrome
    return complete(n?.url, n?.username, n?.password)
  } catch {
    return null
  }
}

function complete(
  url: string | undefined,
  user: string | undefined,
  password: string | undefined,
): NavidromeConfig | null {
  const base = url?.trim().replace(/\/+$/, "")
  const name = user?.trim()
  return base && name && password ? { url: base, user: name, password } : null
}
