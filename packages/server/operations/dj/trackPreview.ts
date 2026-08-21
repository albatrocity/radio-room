import type { AppContext, TaggedMetadataSourceTrack } from "@repo/types"
import generateId from "../../lib/generateId"
import {
  getCachedTrackPreview,
  getInFlightPreviewGeneration,
  getInFlightPreviewKey,
  setInFlightPreviewGeneration,
  storeTrackPreview,
  type TrackPreviewGenerationResult,
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
      tracks: TaggedMetadataSourceTrack[]
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
    source:
      resolved.kind === "album"
        ? { kind: "album", albumId: resolved.albumId }
        : { kind: "playlist", playlistId: resolved.playlistId },
    logLabel: "listMediaItemTracks",
    cache: context.cache,
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

  const shelves = context.metadataSourceAccess?.getLocalCatalogShelves
    ? await context.metadataSourceAccess.getLocalCatalogShelves(roomId, userId)
    : undefined
  const playlistIds = shelves?.playlistIds
  const albumIds = shelves?.albumIds

  const { getBridgeRpcClient, checkLocalTrackPlaylistMembership } = await import(
    "@repo/adapter-bridge"
  )
  const rpc = getBridgeRpcClient(roomId)
  if (!rpc) {
    return { ok: false, message: BRIDGE_UNREACHABLE_MESSAGE }
  }

  const hasShelfFilter =
    (playlistIds?.length ?? 0) > 0 || (albumIds?.length ?? 0) > 0
  const memberOf = await checkLocalTrackPlaylistMembership({
    rpc,
    trackId,
    playlistIds: playlistIds ?? [],
    albumIds: albumIds ?? [],
  })

  if (
    hasShelfFilter &&
    memberOf.playlistIds.length === 0 &&
    memberOf.albumIds.length === 0
  ) {
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
}): Promise<{ ok: true } | BrowseFailure> {
  const { context, roomId, userId, mediaKey, trackId } = params
  const resolved = context.pluginRegistry?.resolvePreviewableMediaItem
    ? await context.pluginRegistry.resolvePreviewableMediaItem({ roomId, userId, mediaKey })
    : null
  if (!resolved) {
    return { ok: false, message: "You can't preview that item" }
  }

  const listed = await fetchResolvedMediaItemTracks({
    roomId,
    source:
      resolved.kind === "album"
        ? { kind: "album", albumId: resolved.albumId }
        : { kind: "playlist", playlistId: resolved.playlistId },
    logLabel: "authorizeMediaItemTrackPreview",
    cache: context.cache,
  })
  if (!listed.ok) return listed

  const onItem = listed.tracks.some((t) => t.id === trackId)
  if (!onItem) {
    return { ok: false, message: "You can't preview that track" }
  }
  return { ok: true }
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
    return await previewResultFromGeneration(roomId, inflight, true)
  }

  const generation = (async (): Promise<TrackPreviewGenerationResult> => {
    try {
      const { getBridgeRpcClient, fetchTrackPreview } = await import("@repo/adapter-bridge")
      const rpc = getBridgeRpcClient(roomId)
      if (!rpc) {
        return { ok: false, message: BRIDGE_UNREACHABLE_MESSAGE }
      }
      const clip = await fetchTrackPreview({ rpc, trackId: id })
      if (!clip.ok) {
        return { ok: false, message: clip.error || BRIDGE_UNREACHABLE_MESSAGE }
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
        return { ok: false, message: "Failed to store track preview" }
      }
      return { ok: true, previewId, durationMs: clip.durationMs }
    } catch (error: unknown) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : "Failed to generate track preview"
      return { ok: false, message }
    }
  })()

  setInFlightPreviewGeneration(inflightKey, generation)
  return await previewResultFromGeneration(roomId, generation, false)
}

async function previewResultFromGeneration(
  roomId: string,
  generation: Promise<TrackPreviewGenerationResult>,
  cached: boolean,
): Promise<
  | { ok: true; url: string; durationMs: number; cached: boolean }
  | BrowseFailure
> {
  try {
    const result = await generation
    if (!result.ok) return result
    return {
      ok: true,
      url: `/api/rooms/${roomId}/track-previews/${result.previewId}`,
      durationMs: result.durationMs,
      cached,
    }
  } catch (error: unknown) {
    const message =
      error instanceof Error && error.message ? error.message : "Failed to generate track preview"
    return { ok: false, message }
  }
}
