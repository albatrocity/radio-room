import type { AppContext } from "@repo/types"
import type { Room } from "@repo/types/Room"
import { findRoom, getUser } from "../data"
import { hasListenableStream, isHybridRadioRoom } from "../../lib/roomTypeHelpers"

export type ListeningAudioTransport = "shoutcast" | "webrtc"

const countsKey = (roomId: string) => `room:${roomId}:listeningTransportCounts`
const userTransportKey = (roomId: string, userId: string) =>
  `room:${roomId}:listeningTransport:${userId}`

function effectiveTransport(
  room: Pick<Room, "type" | "liveIngestEnabled">,
  requested?: ListeningAudioTransport,
): ListeningAudioTransport | null {
  if (!hasListenableStream(room)) return null
  if (room.type === "live") return "webrtc"
  if (room.type === "radio" && !room.liveIngestEnabled) return "shoutcast"
  return requested ?? "shoutcast"
}

async function adjustCount(
  context: AppContext,
  roomId: string,
  transport: ListeningAudioTransport,
  delta: 1 | -1,
): Promise<void> {
  const key = countsKey(roomId)
  const field = transport
  const v = await context.redis.pubClient.hIncrBy(key, field, delta)
  if (v < 0) {
    await context.redis.pubClient.hSet(key, field, "0")
  }
}

/**
 * Apply a listening transport when the user enters listening mode.
 */
export async function onListeningStarted(
  context: AppContext,
  roomId: string,
  userId: string,
  requested?: ListeningAudioTransport,
): Promise<void> {
  const room = await findRoom({ context, roomId })
  if (!room) return
  const transport = effectiveTransport(room, requested)
  if (!transport) return

  const uKey = userTransportKey(roomId, userId)
  const existing = await context.redis.pubClient.get(uKey)
  if (existing === transport) return
  if (existing === "shoutcast" || existing === "webrtc") {
    await adjustCount(context, roomId, existing as ListeningAudioTransport, -1)
  }
  await adjustCount(context, roomId, transport, 1)
  await context.redis.pubClient.set(uKey, transport)
}

/**
 * Clear listening transport counts for a user leaving listening mode.
 */
export async function onListeningStopped(
  context: AppContext,
  roomId: string,
  userId: string,
): Promise<void> {
  const uKey = userTransportKey(roomId, userId)
  const existing = await context.redis.pubClient.get(uKey)
  if (existing !== "shoutcast" && existing !== "webrtc") return
  await adjustCount(context, roomId, existing, -1)
  await context.redis.pubClient.del(uKey)
}

/**
 * While already in listening mode, switch Shoutcast vs WebRTC (hybrid / live).
 */
export async function onListeningTransportChanged(
  context: AppContext,
  roomId: string,
  userId: string,
  next: ListeningAudioTransport,
): Promise<void> {
  const room = await findRoom({ context, roomId })
  if (!room) return
  const transport = effectiveTransport(room, next)
  if (!transport) return

  const uKey = userTransportKey(roomId, userId)
  const existing = await context.redis.pubClient.get(uKey)
  if (existing === transport) return
  if (existing === "shoutcast" || existing === "webrtc") {
    await adjustCount(context, roomId, existing as ListeningAudioTransport, -1)
  }
  await adjustCount(context, roomId, transport, 1)
  await context.redis.pubClient.set(uKey, transport)
}

/**
 * On socket disconnect: if the user was listening, decrement their transport bucket.
 */
export async function onListeningUserDisconnected(
  context: AppContext,
  roomId: string,
  userId: string,
): Promise<void> {
  const user = await getUser({ context, userId })
  if (user?.status !== "listening") return
  await onListeningStopped(context, roomId, userId)
}

/**
 * When hybrid radio WebRTC/RTMP ingest is disabled, every listener bucketed as WebRTC
 * must move to Shoutcast so counts and per-user keys match effective transport.
 */
export async function migrateWebRtcListeningTransportsToShoutcast(
  context: AppContext,
  roomId: string,
): Promise<void> {
  const prefix = `room:${roomId}:listeningTransport:`
  for await (const key of context.redis.pubClient.scanIterator({
    MATCH: `${prefix}*`,
    COUNT: 128,
  })) {
    const v = await context.redis.pubClient.get(key)
    if (v !== "webrtc") continue
    await context.redis.pubClient.set(key, "shoutcast")
    await adjustCount(context, roomId, "webrtc", -1)
    await adjustCount(context, roomId, "shoutcast", 1)
  }
}

export async function getListeningTransportCounts(
  context: AppContext,
  roomId: string,
): Promise<{ shoutcast: number; webrtc: number }> {
  const raw = await context.redis.pubClient.hGetAll(countsKey(roomId))
  const shoutcast = Math.max(0, Number.parseInt(raw.shoutcast ?? "0", 10) || 0)
  const webrtc = Math.max(0, Number.parseInt(raw.webrtc ?? "0", 10) || 0)
  return { shoutcast, webrtc }
}

export function shouldSnapshotListeningTransports(
  room: Pick<Room, "type" | "liveIngestEnabled"> | null | undefined,
): boolean {
  return !!room && (room.type === "live" || isHybridRadioRoom(room))
}
