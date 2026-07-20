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
  }),
  z.object({
    type: z.literal("CAPABILITIES"),
    services: z.array(z.string()),
  }),
  z.object({ type: z.literal("DISCONNECTING") }),
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

export const BRIDGE_RPC_TIMEOUT_MS = 8000
export const BRIDGE_PRESENCE_TTL_SEC = 10
