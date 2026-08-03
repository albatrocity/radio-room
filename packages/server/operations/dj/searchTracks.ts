import type { AppContext, MetadataSource, Room } from "@repo/types"
import {
  dedupeSearchResultsByPriority,
  isMetadataSourceAuthFailure,
  metadataSourceSupportsBrowse,
  rankSearchResultsByRelevance,
} from "@repo/utils"
import { AdapterService } from "../../services/AdapterService"
import { findRoom } from "../data"
import { publishMetadataAuthError } from "./metadataAuthError"

export type SearchSourceResult = {
  success: boolean
  data?: unknown[]
  message?: string
  error?: unknown
}

export type SearchTracksResult =
  | { success: false; message: string }
  | {
      success: true
      items: unknown[]
      total: number
      offset: number
      limit: number
      artists: Array<Record<string, unknown>>
      albums: Array<Record<string, unknown>>
      authErrors?: { source: string; status: number; message: string }[]
    }

/**
 * Fan-out metadata search across room sources with access/capability filtering,
 * cross-source dedupe, relevance ranking, and hybrid entity enrichment (ADR 0085–0090).
 */
export async function searchTracksAcrossSources(params: {
  context: AppContext
  adapterService: AdapterService
  roomId: string
  userId: string
  query: string
  searchSource: (
    metadataSource: MetadataSource,
    query: string,
  ) => Promise<SearchSourceResult>
}): Promise<SearchTracksResult> {
  const { context, adapterService, roomId, userId, query, searchSource } = params

  const room = await findRoom({ context, roomId })
  if (!room) {
    return { success: false, message: "Room not found" }
  }

  const sources = await adapterService.getRoomMetadataSources(roomId)
  if (sources.size === 0) {
    return { success: false, message: "No metadata source configured for this room" }
  }

  let sourceEntries = [...sources.entries()]
  if (context.metadataSourceAccess) {
    const accessible = new Set(
      await context.metadataSourceAccess.getEffectiveSourceIdsForUser(roomId, userId, "search"),
    )
    sourceEntries = sourceEntries.filter(([name]) => accessible.has(name))
  } else if (room.playbackControllerId === "bridge") {
    try {
      const { getOrCreateCapabilityCache } = await import("@repo/adapter-bridge")
      const { filterMetadataSourcesByBridgeCapability } = await import("@repo/utils")
      const capability = getOrCreateCapabilityCache(context.redis.pubClient, roomId)
      await capability.start()
      const allowed = new Set(
        filterMetadataSourcesByBridgeCapability({
          metadataSourceIds: sourceEntries.map(([name]) => name),
          bridgeConnected: capability.isConnected(),
          capabilitiesKnown: capability.hasReceivedCapabilities(),
          availableServices: capability.getAvailableServices(),
        }),
      )
      sourceEntries = sourceEntries.filter(([name]) => allowed.has(name))
    } catch (e) {
      console.warn("[search] bridge capability filter failed; using full policy set:", e)
    }
  }

  if (sourceEntries.length === 0) {
    return { success: false, message: "No metadata source available for search" }
  }

  const settled = await Promise.allSettled(
    sourceEntries.map(async ([name, src]) => {
      const result = await searchSource(src, query)
      if (!result.success) throw new Error(result.message)
      return (result.data ?? []).map((track) => ({
        ...(track as object),
        source: name,
      }))
    }),
  )

  const authErrors: { source: string; status: number; message: string }[] = []
  let items = settled.flatMap((r, i) => {
    if (r.status === "fulfilled") return r.value
    const name = sourceEntries[i]?.[0] ?? "unknown"
    console.warn(`[search] ${name} failed:`, r.reason)
    if (isMetadataSourceAuthFailure(r.reason)) {
      const message =
        r.reason instanceof Error ? r.reason.message : String(r.reason ?? "Authentication failed")
      authErrors.push({ source: name, status: 401, message })
    }
    return []
  })

  const priority =
    (room as Room & { mediaSourcePriority?: string[] }).mediaSourcePriority ??
    (room.playbackControllerId === "bridge" ? ["spotify", "tidal"] : null)
  if (priority) {
    items = dedupeSearchResultsByPriority(items as Parameters<typeof dedupeSearchResultsByPriority>[0], priority)
  }

  items = rankSearchResultsByRelevance(
    query,
    items as Parameters<typeof rankSearchResultsByRelevance>[1],
  )

  let artists: Array<Record<string, unknown>> = []
  let albums: Array<Record<string, unknown>> = []
  const trimmed = query.trim()
  if (trimmed.length >= 2) {
    const entitySettled = await Promise.allSettled(
      sourceEntries.map(async ([name, src]) => {
        if (!metadataSourceSupportsBrowse(src.api)) {
          return { artists: [] as unknown[], albums: [] as unknown[] }
        }
        const [artistResult, albumResult] = await Promise.allSettled([
          src.api.listArtists?.({ query: trimmed, limit: 5 }) ?? Promise.resolve({ items: [] }),
          src.api.listAlbums?.({ query: trimmed, limit: 5 }) ?? Promise.resolve({ items: [] }),
        ])
        const artistItems =
          artistResult.status === "fulfilled" ? (artistResult.value.items ?? []) : []
        const albumItems =
          albumResult.status === "fulfilled" ? (albumResult.value.items ?? []) : []
        return {
          artists: artistItems.map((a) => ({ ...a, source: name })),
          albums: albumItems.map((a) => ({ ...a, source: name })),
        }
      }),
    )
    entitySettled.forEach((r, i) => {
      if (r.status === "fulfilled") {
        artists = artists.concat(r.value.artists as Array<Record<string, unknown>>)
        albums = albums.concat(r.value.albums as Array<Record<string, unknown>>)
        return
      }
      const name = sourceEntries[i]?.[0]
      if (
        name &&
        isMetadataSourceAuthFailure(r.reason) &&
        !authErrors.some((e) => e.source === name)
      ) {
        const message =
          r.reason instanceof Error
            ? r.reason.message
            : String(r.reason ?? "Authentication failed")
        authErrors.push({ source: name, status: 401, message })
      }
    })
  }

  if (authErrors.length > 0) {
    await publishMetadataAuthError({
      context,
      roomId,
      creatorUserId: room.creator,
      error: new Error(authErrors[0]?.message ?? "Metadata source authentication failed"),
      source: authErrors.map((e) => e.source).join(","),
    })
  } else if (room.spotifyError) {
    const { removeUserRoomsSpotifyError } = await import("../data/rooms")
    await removeUserRoomsSpotifyError({ context, userId: room.creator })
  }

  return {
    success: true,
    items,
    total: items.length,
    offset: 0,
    limit: 20,
    artists,
    albums,
    ...(authErrors.length > 0 ? { authErrors } : {}),
  }
}
