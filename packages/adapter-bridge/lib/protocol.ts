import { z } from "zod"

export const bridgeSourceSchema = z.enum(["tidal", "youtube", "local", "spotify"])
export type BridgeSource = z.infer<typeof bridgeSourceSchema>

export const bridgeRequestSchema = z.object({
  id: z.string(),
  method: z.enum([
    "play",
    "pause",
    "stop",
    "playTrack",
    "seekTo",
    "getPlayback",
    "setVolume",
    "search",
    "getTrack",
    "notifyNowPlaying",
  ]),
  params: z.record(z.string(), z.unknown()).default({}),
})
export type BridgeRequest = z.infer<typeof bridgeRequestSchema>

export const bridgeResponseSchema = z.object({
  id: z.string(),
  ok: z.boolean(),
  result: z.unknown().optional(),
  error: z.string().optional(),
})
export type BridgeResponse = z.infer<typeof bridgeResponseSchema>

export const bridgeEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("STATE"),
    source: z.string(),
    state: z.enum(["playing", "paused", "stopped"]),
    progressMs: z.number().nullable(),
    durationMs: z.number().nullable(),
    volumePercent: z.number().nullable().optional(),
  }),
  z.object({
    type: z.literal("ENDED"),
    source: z.string(),
    trackId: z.string(),
    /** natural | error-* | watchdog — unplayable reasons trigger a chat notice */
    reason: z.string().optional(),
  }),
  z.object({
    type: z.literal("CAPABILITIES"),
    services: z.array(z.string()),
  }),
  z.object({ type: z.literal("DISCONNECTING") }),
  /** Daemon asks the API to write a fresh Spotify access token for the SDK device host. */
  z.object({
    type: z.literal("TOKEN_REQUEST"),
    service: z.literal("spotify"),
  }),
])
export type BridgeEvent = z.infer<typeof bridgeEventSchema>

export function requestChannel(roomId: string) {
  return `BRIDGE:${roomId}:REQUEST`
}

export function responseChannel(roomId: string) {
  return `BRIDGE:${roomId}:RESPONSE`
}

export function eventChannel(roomId: string) {
  return `BRIDGE:${roomId}:EVENT`
}

export function presenceKey(roomId: string) {
  return `bridge:${roomId}:presence`
}

/** Durable ENDED signal — pub/sub alone is unreliable across Docker/host Redis clients. */
export function lastEndedKey(roomId: string) {
  return `bridge:${roomId}:last_ended`
}

/** Spotify Web Playback SDK access token (written by API, read by daemon). */
export function spotifyTokenKey(roomId: string) {
  return `bridge:${roomId}:spotify_token`
}

/** Spotify Web Playback SDK Connect device id (written by daemon on SDK ready). */
export function spotifyDeviceKey(roomId: string) {
  return `bridge:${roomId}:spotify_device`
}

/**
 * Must match `new Spotify.Player({ name })` in apps/bridge-daemon/static/spotify.html.
 * The SDK `ready` device_id often differs from the id in GET /me/player/devices;
 * resolve by this name when ids diverge.
 */
export const BRIDGE_SPOTIFY_DEVICE_NAME = "Listening Room Bridge"

export const BRIDGE_RPC_TIMEOUT_MS = 8000
export const BRIDGE_PRESENCE_TTL_SEC = 10
export const BRIDGE_LAST_ENDED_TTL_SEC = 60
/** Slightly under Spotify's typical 1h access-token lifetime. */
export const BRIDGE_SPOTIFY_TOKEN_TTL_SEC = 50 * 60
