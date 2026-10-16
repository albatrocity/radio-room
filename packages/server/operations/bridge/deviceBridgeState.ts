import type { AppContext } from "@repo/types"
import {
  BRIDGE_LAST_ENDED_TTL_SEC,
  BRIDGE_PRESENCE_TTL_SEC,
  capabilitiesKey,
  lastEndedKey,
  presenceKey,
  spotifyDeviceKey,
} from "@repo/adapter-bridge"

/** Presence and capabilities keys jobs read when the device socket is this process's. */
export async function writeDevicePresence(
  context: AppContext,
  roomId: string,
  services?: string[],
): Promise<void> {
  await context.redis.pubClient.set(presenceKey(roomId), "1", { EX: BRIDGE_PRESENCE_TTL_SEC })
  if (services) {
    await context.redis.pubClient.set(capabilitiesKey(roomId), JSON.stringify(services), {
      EX: BRIDGE_PRESENCE_TTL_SEC,
    })
  }
}

export async function clearDevicePresence(context: AppContext, roomId: string): Promise<void> {
  await context.redis.pubClient.del(presenceKey(roomId))
  await context.redis.pubClient.del(capabilitiesKey(roomId))
}

/** Durable ENDED record the advance job already consumes. */
export async function writeDeviceTrackEnded(
  context: AppContext,
  roomId: string,
  ended: { trackId: string; source: string; reason?: string },
): Promise<void> {
  await context.redis.pubClient.set(
    lastEndedKey(roomId),
    JSON.stringify({
      trackId: ended.trackId,
      source: ended.source,
      reason: ended.reason,
      at: Date.now(),
    }),
    { EX: BRIDGE_LAST_ENDED_TTL_SEC },
  )
}

/** Connect device id playback targeting reads at `bridge:{room}:spotify_device`. */
export async function writeDeviceSpotifyId(
  context: AppContext,
  roomId: string,
  deviceId: string | null,
): Promise<void> {
  if (deviceId) {
    await context.redis.pubClient.set(spotifyDeviceKey(roomId), deviceId)
    return
  }
  await context.redis.pubClient.del(spotifyDeviceKey(roomId))
}
