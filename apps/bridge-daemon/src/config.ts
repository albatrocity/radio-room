import { z } from "zod"
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

/** Default localhost control UI (distinct from StaticHost :18765 and local-remote :9876). */
export const DEFAULT_HTTP_LISTEN = "127.0.0.1:18766"

export const bridgeDaemonConfigSchema = z.object({
  redisUrl: z.string().default("redis://127.0.0.1:6379"),
  defaultRoomId: z.string().optional(),
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
    })
    .default({ url: "http://127.0.0.1:4533", username: "", password: "" }),
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

export function saveConfig(config: BridgeDaemonConfig): void {
  const dir = configDir()
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(configPath(), JSON.stringify(config, null, 2) + "\n")
}

export function defaultNowPlayingPath(): string {
  return join(configDir(), "Now Playing.txt")
}
