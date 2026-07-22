import { randomUUID } from "node:crypto"
import { z } from "zod"
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import {
  DEFAULT_PUBLIC_URL_TAG_PRIORITY,
  PUBLIC_URL_TAG_TOKENS,
} from "./drivers/publicUrlTagPriority"

/** Default localhost control UI (distinct from StaticHost :18765 and local-remote :9876). */
export const DEFAULT_HTTP_LISTEN = "127.0.0.1:18766"

export const bridgeDaemonConfigSchema = z.object({
  redisUrl: z.string().default("redis://127.0.0.1:6379"),
  defaultRoomId: z.string().optional(),
  /** Stable id for Redis standby presence / LINK_ACK (generated once). */
  daemonId: z.string().optional(),
  /** Local HTTP control UI bind address (`host:port`). */
  httpListen: z.string().default(DEFAULT_HTTP_LISTEN),
  services: z
    .array(z.enum(["youtube", "tidal", "local", "spotify"]))
    .default(["youtube", "local"]),
  chrome: z
    .object({
      executablePath: z
        .string()
        .default("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
      userDataDir: z.string().optional(),
      debuggingPort: z.number().int().default(9222),
    })
    .default({
      executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      debuggingPort: 9222,
    }),
  tidal: z
    .object({
      executablePath: z
        .string()
        .default("/Applications/TIDAL.app/Contents/MacOS/TIDAL"),
      debuggingPort: z.number().int().default(9223),
    })
    .default({
      executablePath: "/Applications/TIDAL.app/Contents/MacOS/TIDAL",
      debuggingPort: 9223,
    }),
  navidrome: z
    .object({
      url: z.string().default("http://127.0.0.1:4533"),
      username: z.string().default(""),
      password: z.string().default(""),
      /**
       * Absolute path to the same MusicFolder Navidrome scans.
       * Required to read purchase/source URLs from audio file tags.
       */
      musicFolder: z.string().optional(),
      /**
       * Order of tag sources when choosing a guest-facing track URL.
       * See docs/BRIDGE_LOCAL_TESTING.md.
       */
      publicUrlTagPriority: z
        .array(z.enum(PUBLIC_URL_TAG_TOKENS))
        .default([...DEFAULT_PUBLIC_URL_TAG_PRIORITY]),
    })
    .default({
      url: "http://127.0.0.1:4533",
      username: "",
      password: "",
      publicUrlTagPriority: [...DEFAULT_PUBLIC_URL_TAG_PRIORITY],
    }),
  mpv: z
    .object({
      path: z.string().default("mpv"),
      socketPath: z.string().optional(),
    })
    .default({ path: "mpv" }),
  nowPlayingPath: z.string().optional(),
  /** @deprecated File always uses Audio Hijack Title:/Artist:/Album: lines. */
  nowPlayingFormat: z.string().default("{title} | {artist} | {album}"),
})

export type BridgeDaemonConfig = z.infer<typeof bridgeDaemonConfigSchema>

export function configDir(): string {
  return join(homedir(), ".config", "listening-room-bridge")
}

export function configPath(): string {
  return join(configDir(), "config.json")
}

export function loadConfig(): BridgeDaemonConfig {
  const path = configPath()
  if (!existsSync(path)) {
    return bridgeDaemonConfigSchema.parse({})
  }
  const raw = JSON.parse(readFileSync(path, "utf8"))
  return bridgeDaemonConfigSchema.parse(raw)
}

/** Ensure daemonId exists and is persisted for standby presence. */
export function ensureDaemonId(config: BridgeDaemonConfig): BridgeDaemonConfig {
  if (config.daemonId) return config
  const next = { ...config, daemonId: randomUUID() }
  saveConfig(next)
  return next
}

export function saveConfig(config: BridgeDaemonConfig): void {
  const dir = configDir()
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(configPath(), JSON.stringify(config, null, 2) + "\n")
}

export function defaultNowPlayingPath(): string {
  return join(configDir(), "Now Playing.txt")
}
