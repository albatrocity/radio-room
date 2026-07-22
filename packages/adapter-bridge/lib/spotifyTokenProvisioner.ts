import type { AppContext } from "@repo/types"
import type { BridgeEvent } from "./protocol"
import {
  BRIDGE_SPOTIFY_TOKEN_TTL_SEC,
  spotifyTokenKey,
} from "./protocol"

/**
 * Copy the room creator's current Spotify access token into the bridge mailbox.
 * Same auth record search/playback use (`user:{creator}:auth:spotify`) — Redis
 * `bridge:{roomId}:spotify_token` is only how the daemon receives it.
 */
export async function provisionSpotifyTokenForRoom(params: {
  context: AppContext
  roomId: string
}): Promise<string | null> {
  const { context, roomId } = params

  const { findRoom } = await import("@repo/server/operations/data")
  const room = await findRoom({ context, roomId })
  if (!room?.creator) {
    console.warn(`[bridge-spotify-token] no room/creator for ${roomId}`)
    return null
  }

  const { createSpotifyServiceAuthAdapter } = await import("@repo/adapter-spotify")
  const authAdapter = createSpotifyServiceAuthAdapter(context)
  const refreshAuth = authAdapter.refreshAuth
  if (!refreshAuth) {
    console.warn(`[bridge-spotify-token] refreshAuth not available`)
    return null
  }

  // Same freshness rules as other Spotify API paths: reuse if still fresh,
  // otherwise refreshAuth (coalesced) so we don't fight search/playback.
  const stored = await context.data?.getUserServiceAuth?.({
    userId: room.creator,
    serviceName: "spotify",
  })
  const expiresAt = stored?.expiresAt ?? 0
  const stillFresh = expiresAt > Date.now() + 5 * 60 * 1000

  let accessToken: string | undefined
  if (stillFresh && stored?.accessToken) {
    accessToken = stored.accessToken
  } else {
    try {
      const refreshed = await refreshAuth(room.creator)
      accessToken = refreshed.accessToken
    } catch (e) {
      console.warn(`[bridge-spotify-token] refresh failed for ${roomId}, trying stored:`, e)
      accessToken = stored?.accessToken
    }
  }

  if (!accessToken) {
    console.warn(`[bridge-spotify-token] no Spotify token available for room ${roomId}`)
    return null
  }

  await context.redis.pubClient.set(spotifyTokenKey(roomId), accessToken, {
    EX: BRIDGE_SPOTIFY_TOKEN_TTL_SEC,
  })
  console.log(`[bridge-spotify-token] provisioned creator token for room ${roomId}`)
  return accessToken
}

const wiredRooms = new Set<string>()

/**
 * Subscribe to TOKEN_REQUEST events and provision on demand.
 * Also provisions once immediately so the daemon can start without waiting.
 * Idempotent per roomId (safe to call from onRoomCreated + registerBridgeForRoom).
 */
export function wireSpotifyTokenProvisioning(params: {
  context: AppContext
  roomId: string
  onEvent: (listener: (event: BridgeEvent) => void) => () => void
}): () => void {
  const { context, roomId, onEvent } = params

  if (wiredRooms.has(roomId)) {
    // Still refresh the token so a reconnecting daemon finds a fresh key
    void provisionSpotifyTokenForRoom({ context, roomId }).catch((e) => {
      console.warn(`[bridge-spotify-token] re-provision failed for ${roomId}:`, e)
    })
    return () => {}
  }
  wiredRooms.add(roomId)

  void provisionSpotifyTokenForRoom({ context, roomId }).catch((e) => {
    console.warn(`[bridge-spotify-token] initial provision failed for ${roomId}:`, e)
  })

  return onEvent((event) => {
    if (event.type !== "TOKEN_REQUEST" || event.service !== "spotify") return
    console.log(`[bridge-spotify-token] TOKEN_REQUEST received for room ${roomId}`)
    void provisionSpotifyTokenForRoom({ context, roomId }).catch((e) => {
      console.error(`[bridge-spotify-token] TOKEN_REQUEST provision failed for ${roomId}:`, e)
    })
  })
}

export function dropSpotifyTokenProvisioning(roomId: string): void {
  wiredRooms.delete(roomId)
}

const lastEnsureAttempt = new Map<string, number>()

/** Ensure a token key exists (used by the advance job as a pub/sub backup). */
export async function ensureSpotifyTokenProvisioned(params: {
  context: AppContext
  roomId: string
}): Promise<void> {
  const { context, roomId } = params
  const ttl = await context.redis.pubClient.ttl(spotifyTokenKey(roomId))
  // -2 = missing, -1 = no expiry; refresh when missing or near expiry
  if (ttl !== -2 && !(ttl >= 0 && ttl < 120)) return

  const now = Date.now()
  const last = lastEnsureAttempt.get(roomId) ?? 0
  if (now - last < 15_000) return
  lastEnsureAttempt.set(roomId, now)

  await provisionSpotifyTokenForRoom({ context, roomId })
}
