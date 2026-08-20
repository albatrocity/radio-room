import type { AppContext, MetadataSourceTrack } from "@repo/types"
import generateId from "../../lib/generateId"
import {
  getCachedTrackPreview,
  getInFlightPreviewGeneration,
  getInFlightPreviewKey,
  setInFlightPreviewGeneration,
  storeTrackPreview,
} from "../data/trackPreviews"
import { BRIDGE_UNREACHABLE_MESSAGE, fetchResolvedMediaItemTracks } from "./mediaItemTracks"

type BrowseFailure = { ok: false; message: string }

export async function listMediaItemTracks(params: {
  context: AppContext
  roomId: string
  userId: string
  mediaKey: string
}): Promise<
  | {
      ok: true
      mediaKey: string
      name: string
      tracks: Array<MetadataSourceTrack & { source: string }>
    }
  | BrowseFailure
> {
  const { context, roomId, userId, mediaKey } = params
  const key = mediaKey?.trim() ?? ""
  if (!key) {
    return { ok: false, message: "mediaKey is required" }
  }

  const resolved = context.pluginRegistry?.resolvePreviewableMediaItem
    ? await context.pluginRegistry.resolvePreviewableMediaItem({ roomId, userId, mediaKey: key })
    : null
  if (!resolved) {
    return { ok: false, message: "You can't preview that item" }
  }

  const listed = await fetchResolvedMediaItemTracks({
    roomId,
    playlistId: resolved.playlistId,
    logLabel: "listMediaItemTracks",
  })
  if (!listed.ok) return listed

  return {
    ok: true,
    mediaKey: resolved.item.mediaKey,
    name: resolved.item.name,
    tracks: listed.tracks,
  }
}

async function authorizeLocalCatalogPreview(params: {
  context: AppContext
  roomId: string
  userId: string
  trackId: string
}): Promise<{ ok: true } | BrowseFailure> {
  const { context, roomId, userId, trackId } = params
  if (context.metadataSourceAccess) {
    const allowed = await context.metadataSourceAccess.canAccess({
      roomId,
      userId,
      sourceId: "local",
      action: "search",
    })
    if (!allowed) {
      return { ok: false, message: "You do not have access to this metadata source" }
    }
  }

  const playlistIds = context.metadataSourceAccess?.getLocalCatalogPlaylistIds
    ? await context.metadataSourceAccess.getLocalCatalogPlaylistIds(roomId, userId)
    : undefined

  const { getBridgeRpcClient, checkLocalTrackPlaylistMembership } = await import(
    "@repo/adapter-bridge"
  )
  const rpc = getBridgeRpcClient(roomId)
  if (!rpc) {
    return { ok: false, message: BRIDGE_UNREACHABLE_MESSAGE }
  }

  const memberOf = await checkLocalTrackPlaylistMembership({
    rpc,
    trackId,
    playlistIds: playlistIds ?? [],
  })

  if (playlistIds?.length && memberOf.length === 0) {
    return { ok: false, message: "You can't preview that track" }
  }

  return { ok: true }
}

async function authorizeMediaItemTrackPreview(params: {
  context: AppContext
  roomId: string
  userId: string
  mediaKey: string
  trackId: string
}): Promise<{ ok: true; playlistId: string } | BrowseFailure> {
  const { context, roomId, userId, mediaKey, trackId } = params
  const resolved = context.pluginRegistry?.resolvePreviewableMediaItem
    ? await context.pluginRegistry.resolvePreviewableMediaItem({ roomId, userId, mediaKey })
    : null
  if (!resolved) {
    return { ok: false, message: "You can't preview that item" }
  }

  const listed = await fetchResolvedMediaItemTracks({
    roomId,
    playlistId: resolved.playlistId,
    logLabel: "authorizeMediaItemTrackPreview",
  })
  if (!listed.ok) return listed

  const onPlaylist = listed.tracks.some((t) => t.id === trackId)
  if (!onPlaylist) {
    return { ok: false, message: "You can't preview that track" }
  }
  return { ok: true, playlistId: resolved.playlistId }
}

export async function getTrackPreview(params: {
  context: AppContext
  roomId: string
  userId: string
  trackId: string
  mediaKey?: string
  source?: string
}): Promise<
  | { ok: true; url: string; durationMs: number; cached: boolean }
  | BrowseFailure
> {
  const { context, roomId, userId, trackId } = params
  const id = trackId?.trim() ?? ""
  if (!id) {
    return { ok: false, message: "trackId is required" }
  }

  const mediaKey = params.mediaKey?.trim()
  if (mediaKey) {
    const auth = await authorizeMediaItemTrackPreview({
      context,
      roomId,
      userId,
      mediaKey,
      trackId: id,
    })
    if (!auth.ok) return auth
  } else if (params.source === "local" || !params.source) {
    const auth = await authorizeLocalCatalogPreview({ context, roomId, userId, trackId: id })
    if (!auth.ok) return auth
  } else {
    return { ok: false, message: "Previews are only available for Local tracks" }
  }

  const cached = await getCachedTrackPreview({ context, roomId, trackId: id })
  if (cached) {
    return {
      ok: true,
      url: `/api/rooms/${roomId}/track-previews/${cached.previewId}`,
      durationMs: 15000,
      cached: true,
    }
  }

  const inflightKey = getInFlightPreviewKey(roomId, id)
  const inflight = getInFlightPreviewGeneration(inflightKey)
  if (inflight) {
    try {
      const result = await inflight
      return {
        ok: true,
        url: `/api/rooms/${roomId}/track-previews/${result.previewId}`,
        durationMs: result.durationMs,
        cached: true,
      }
    } catch (error: unknown) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : "Failed to generate track preview"
      return { ok: false, message }
    }
  }

  const generation = (async () => {
    const { getBridgeRpcClient, fetchTrackPreview } = await import("@repo/adapter-bridge")
    const rpc = getBridgeRpcClient(roomId)
    if (!rpc) {
      throw new Error(BRIDGE_UNREACHABLE_MESSAGE)
    }
    const clip = await fetchTrackPreview({ rpc, trackId: id })
    if (!clip.ok) {
      throw new Error(clip.error || BRIDGE_UNREACHABLE_MESSAGE)
    }
    const previewId = generateId()
    const stored = await storeTrackPreview({
      context,
      roomId,
      trackId: id,
      previewId,
      base64Data: clip.data,
      mimeType: clip.mimeType,
    })
    if (!stored.success) {
      throw new Error("Failed to store track preview")
    }
    return { previewId, durationMs: clip.durationMs }
  })()

  setInFlightPreviewGeneration(inflightKey, generation)

  try {
    const result = await generation
    return {
      ok: true,
      url: `/api/rooms/${roomId}/track-previews/${result.previewId}`,
      durationMs: result.durationMs,
      cached: false,
    }
  } catch (error: unknown) {
    const message =
      error instanceof Error && error.message ? error.message : "Failed to generate track preview"
    return { ok: false, message }
  }
}
