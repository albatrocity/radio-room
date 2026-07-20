import type { RedisClientType } from "redis"

type RedisLike = RedisClientType<any, any, any>

export type DiscoveredRoom = {
  id: string
  title: string
  type: string
  playbackControllerId: string
  playbackMode: string
  public: boolean
  /** True when this room is configured for the bridge daemon. */
  bridgeReady: boolean
}

/**
 * List rooms known to the API via the Redis `rooms` set + `room:{id}:details` hashes.
 */
export async function listRoomsFromRedis(redis: RedisLike): Promise<DiscoveredRoom[]> {
  const ids = await redis.sMembers("rooms")
  const rooms: DiscoveredRoom[] = []

  for (const id of ids) {
    const details = await redis.hGetAll(`room:${id}:details`)
    if (!details || Object.keys(details).length === 0) continue

    const playbackControllerId = details.playbackControllerId ?? ""
    rooms.push({
      id,
      title: details.title || id,
      type: details.type || "unknown",
      playbackControllerId,
      playbackMode: details.playbackMode || "",
      public: details.public !== "false",
      bridgeReady: playbackControllerId === "bridge",
    })
  }

  rooms.sort((a, b) => {
    if (a.bridgeReady !== b.bridgeReady) return a.bridgeReady ? -1 : 1
    return a.title.localeCompare(b.title)
  })

  return rooms
}
