import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))

export type DevRadioConfig = {
  port: number
  redisUrl: string
  roomId: string | null
  mp3Path: string
  fallbackRotateMs: number
  metaint: number
  bitrateKbps: number
  host: string
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): DevRadioConfig {
  const defaultMp3 = resolve(here, "../fixtures/loop.mp3")
  return {
    port: Number(env.PORT || 8010),
    redisUrl: env.REDIS_URL || "redis://127.0.0.1:6379",
    roomId: env.ROOM_ID?.trim() || null,
    mp3Path: env.MP3_PATH ? resolve(env.MP3_PATH) : defaultMp3,
    fallbackRotateMs: Number(env.FALLBACK_ROTATE_MS || 30_000),
    metaint: Number(env.ICY_METAINT || 16000),
    bitrateKbps: Number(env.BITRATE_KBPS || 128),
    host: env.HOST || "0.0.0.0",
  }
}

export function fixturePath(...parts: string[]): string {
  return join(resolve(here, "../fixtures"), ...parts)
}
