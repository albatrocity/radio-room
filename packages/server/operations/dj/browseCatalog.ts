import type {
  AppContext,
  MetadataBrowseAlbum,
  MetadataBrowseArtist,
  MetadataBrowseCapabilities,
  MetadataSource,
  MetadataSourceTrack,
} from "@repo/types"
import {
  isMetadataSourceAuthFailure,
  metadataSourceSupportsBrowse,
  resolveBrowseCapabilities,
} from "@repo/utils"
import { AdapterService } from "../../services/AdapterService"
import { findRoom } from "../data"
import { publishMetadataAuthError } from "./metadataAuthError"

export type ResolveBrowseSourceResult =
  | { ok: true; metadataSource: MetadataSource }
  | { ok: false; message: string }

export async function resolveBrowseMetadata(params: {
  adapterService: AdapterService
  roomId: string
  metadataSourceIds: string[]
}): Promise<{
  browseableSourceIds: string[]
  browseSourceCapabilities: Record<string, MetadataBrowseCapabilities>
}> {
  const { adapterService, roomId, metadataSourceIds } = params
  if (metadataSourceIds.length === 0) {
    return { browseableSourceIds: [], browseSourceCapabilities: {} }
  }
  const sources = await adapterService.getRoomMetadataSources(roomId)
  const browseableSourceIds: string[] = []
  const browseSourceCapabilities: Record<string, MetadataBrowseCapabilities> = {}
  for (const id of metadataSourceIds) {
    const src = sources.get(id)
    if (!src || !metadataSourceSupportsBrowse(src.api)) continue
    browseableSourceIds.push(id)
    browseSourceCapabilities[id] = resolveBrowseCapabilities(src.api)
  }
  return { browseableSourceIds, browseSourceCapabilities }
}

export async function resolveBrowseSource(params: {
  context: AppContext
  adapterService: AdapterService
  roomId: string
  userId: string
  source: string
}): Promise<ResolveBrowseSourceResult> {
  const { context, adapterService, roomId, userId, source } = params
  if (!source) {
    return { ok: false, message: "source is required" }
  }

  if (context.metadataSourceAccess) {
    const allowed = await context.metadataSourceAccess.canAccess({
      roomId,
      userId,
      sourceId: source,
      action: "search",
    })
    if (!allowed) {
      return { ok: false, message: "You do not have access to this metadata source" }
    }
  }

  const sources = await adapterService.getRoomMetadataSources(roomId)
  const metadataSource = sources.get(source)
  if (!metadataSource) {
    return { ok: false, message: "Metadata source not available" }
  }
  if (!metadataSourceSupportsBrowse(metadataSource.api)) {
    return { ok: false, message: "Metadata source does not support browse" }
  }
  return { ok: true, metadataSource }
}

export async function getEffectiveMetadataSources(params: {
  context: AppContext
  adapterService: AdapterService
  roomId: string
  userId: string
}): Promise<{
  metadataSourceIds: string[]
  browseableSourceIds: string[]
  browseSourceCapabilities: Record<string, MetadataBrowseCapabilities>
}> {
  const { context, adapterService, roomId, userId } = params
  let metadataSourceIds: string[]
  if (!context.metadataSourceAccess) {
    const room = await findRoom({ context, roomId })
    metadataSourceIds = room?.metadataSourceIds ?? []
  } else {
    metadataSourceIds = await context.metadataSourceAccess.getEffectiveSourceIdsForUser(
      roomId,
      userId,
      "search",
    )
  }

  const browse = await resolveBrowseMetadata({
    adapterService,
    roomId,
    metadataSourceIds,
  })
  return { metadataSourceIds, ...browse }
}

type BrowseFailure = { ok: false; message: string; authFailure?: { status: 401; source: string } }
type BrowseListSuccess<T> = { ok: true; source: string; items: T[]; total?: number }

async function withBrowseAuthHandling<T>(params: {
  context: AppContext
  roomId: string
  source: string
  run: () => Promise<T>
  failureMessage: string
}): Promise<T | BrowseFailure> {
  const { context, roomId, source, run, failureMessage } = params
  try {
    return await run()
  } catch (error: unknown) {
    console.error(failureMessage, error)
    const room = await findRoom({ context, roomId })
    if (room) {
      await publishMetadataAuthError({
        context,
        roomId,
        creatorUserId: room.creator,
        error,
        source,
      })
    }
    const message =
      error instanceof Error && error.message ? error.message : failureMessage
    return {
      ok: false,
      message,
      ...(isMetadataSourceAuthFailure(error) ? { authFailure: { status: 401 as const, source } } : {}),
    }
  }
}

export async function browseArtists(params: {
  context: AppContext
  adapterService: AdapterService
  roomId: string
  userId: string
  source: string
  query?: string
  offset?: number
  limit?: number
}): Promise<BrowseListSuccess<MetadataBrowseArtist> | BrowseFailure> {
  const { context, adapterService, roomId, userId, source, query, offset, limit } = params
  const resolved = await resolveBrowseSource({ context, adapterService, roomId, userId, source })
  if (!resolved.ok) return resolved

  const playlistIds =
    source === "local" && context.metadataSourceAccess?.getLocalCatalogPlaylistIds
      ? await context.metadataSourceAccess.getLocalCatalogPlaylistIds(roomId, userId)
      : undefined

  const result = await withBrowseAuthHandling({
    context,
    roomId,
    source,
    failureMessage: "Failed to browse artists",
    run: async () => {
      const listed = await resolved.metadataSource.api.listArtists!({
        query,
        offset,
        limit,
        ...(playlistIds?.length ? { playlistIds } : {}),
      })
      return {
        ok: true as const,
        source,
        items: listed.items,
        total: listed.total,
      }
    },
  })
  return result
}

export async function browseAlbums(params: {
  context: AppContext
  adapterService: AdapterService
  roomId: string
  userId: string
  source: string
  query?: string
  offset?: number
  limit?: number
}): Promise<BrowseListSuccess<MetadataBrowseAlbum> | BrowseFailure> {
  const { context, adapterService, roomId, userId, source, query, offset, limit } = params
  const resolved = await resolveBrowseSource({ context, adapterService, roomId, userId, source })
  if (!resolved.ok) return resolved

  if (typeof resolved.metadataSource.api.listAlbums !== "function") {
    return { ok: false, message: "Metadata source does not support album browse" }
  }

  const playlistIds =
    source === "local" && context.metadataSourceAccess?.getLocalCatalogPlaylistIds
      ? await context.metadataSourceAccess.getLocalCatalogPlaylistIds(roomId, userId)
      : undefined

  const result = await withBrowseAuthHandling({
    context,
    roomId,
    source,
    failureMessage: "Failed to browse albums",
    run: async () => {
      const listed = await resolved.metadataSource.api.listAlbums!({
        query,
        offset,
        limit,
        ...(playlistIds?.length ? { playlistIds } : {}),
      })
      return {
        ok: true as const,
        source,
        items: listed.items,
        total: listed.total,
      }
    },
  })
  return result
}

export async function browseArtist(params: {
  context: AppContext
  adapterService: AdapterService
  roomId: string
  userId: string
  source: string
  artistId: string
}): Promise<
  | { ok: true; source: string; artist: MetadataBrowseArtist; albums: MetadataBrowseAlbum[] }
  | BrowseFailure
> {
  const { context, adapterService, roomId, userId, source, artistId } = params
  const resolved = await resolveBrowseSource({ context, adapterService, roomId, userId, source })
  if (!resolved.ok) return resolved

  if (!artistId) {
    return { ok: false, message: "artistId is required" }
  }

  const playlistIds =
    source === "local" && context.metadataSourceAccess?.getLocalCatalogPlaylistIds
      ? await context.metadataSourceAccess.getLocalCatalogPlaylistIds(roomId, userId)
      : undefined

  const result = await withBrowseAuthHandling({
    context,
    roomId,
    source,
    failureMessage: "Failed to browse artist",
    run: async () => {
      const got = await resolved.metadataSource.api.getArtist!(
        artistId,
        playlistIds?.length ? { playlistIds } : undefined,
      )
      if (!got) {
        return { ok: false as const, message: "Artist not found" }
      }
      return {
        ok: true as const,
        source,
        artist: got.artist,
        albums: got.albums,
      }
    },
  })
  return result
}

export async function browseAlbum(params: {
  context: AppContext
  adapterService: AdapterService
  roomId: string
  userId: string
  source: string
  albumId: string
}): Promise<
  | {
      ok: true
      source: string
      album: MetadataBrowseAlbum
      tracks: Array<MetadataSourceTrack & { source: string }>
    }
  | BrowseFailure
> {
  const { context, adapterService, roomId, userId, source, albumId } = params
  const resolved = await resolveBrowseSource({ context, adapterService, roomId, userId, source })
  if (!resolved.ok) return resolved

  if (!albumId) {
    return { ok: false, message: "albumId is required" }
  }

  const playlistIds =
    source === "local" && context.metadataSourceAccess?.getLocalCatalogPlaylistIds
      ? await context.metadataSourceAccess.getLocalCatalogPlaylistIds(roomId, userId)
      : undefined

  const result = await withBrowseAuthHandling({
    context,
    roomId,
    source,
    failureMessage: "Failed to browse album",
    run: async () => {
      const got = await resolved.metadataSource.api.getAlbum!(
        albumId,
        playlistIds?.length ? { playlistIds } : undefined,
      )
      if (!got) {
        return { ok: false as const, message: "Album not found" }
      }
      const tracks = got.tracks.map((track) => ({
        ...track,
        source,
      }))
      return {
        ok: true as const,
        source,
        album: got.album,
        tracks,
      }
    },
  })
  return result
}
