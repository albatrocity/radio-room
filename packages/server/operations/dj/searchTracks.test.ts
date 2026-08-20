import { beforeEach, describe, expect, test, vi } from "vitest"
import type { AppContext, MetadataSource } from "@repo/types"
import { searchTracksAcrossSources } from "./searchTracks"

vi.mock("../data", () => ({
  findRoom: vi.fn(),
}))

vi.mock("../data/rooms", () => ({
  removeUserRoomsSpotifyError: vi.fn(),
}))

vi.mock("./metadataAuthError", () => ({
  publishMetadataAuthError: vi.fn(),
}))

import { findRoom } from "../data"
import { publishMetadataAuthError } from "./metadataAuthError"

describe("searchTracksAcrossSources", () => {
  const roomId = "room1"
  const userId = "user1"
  const mockContext = {
    metadataSourceAccess: undefined,
    redis: { pubClient: {} },
  } as unknown as AppContext

  const spotifySource = {
    name: "spotify",
    api: {
      search: vi.fn(),
      listArtists: undefined,
      listAlbums: undefined,
    },
  } as unknown as MetadataSource

  const adapterService = {
    getRoomMetadataSources: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(findRoom).mockResolvedValue({
      id: roomId,
      creator: "creator1",
      metadataSourceIds: ["spotify"],
      playbackControllerId: "spotify",
    } as any)
    adapterService.getRoomMetadataSources.mockResolvedValue(new Map([["spotify", spotifySource]]))
  })

  test("returns failure when room missing", async () => {
    vi.mocked(findRoom).mockResolvedValueOnce(null)
    const result = await searchTracksAcrossSources({
      context: mockContext,
      adapterService: adapterService as any,
      roomId,
      userId,
      query: "neon",
      searchSource: vi.fn(),
    })
    expect(result).toEqual({ success: false, message: "Room not found" })
  })

  test("fans out, tags source, and ranks results", async () => {
    const searchSource = vi.fn().mockResolvedValue({
      success: true,
      data: [
        { id: "1", title: "Other", artists: [{ title: "X" }], urls: [] },
        { id: "2", title: "Neon Lights", artists: [{ title: "Band" }], urls: [] },
      ],
    })

    const result = await searchTracksAcrossSources({
      context: mockContext,
      adapterService: adapterService as any,
      roomId,
      userId,
      query: "Neon Lights",
      searchSource,
    })

    expect(searchSource).toHaveBeenCalledWith(spotifySource, "Neon Lights", undefined)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.items[0]).toEqual(
      expect.objectContaining({ id: "2", title: "Neon Lights", source: "spotify" }),
    )
    expect(result.total).toBe(2)
    expect(result.artists).toEqual([])
    expect(result.albums).toEqual([])
    expect(publishMetadataAuthError).not.toHaveBeenCalled()
  })

  test("returns empty items with authErrors on token failure", async () => {
    const message =
      "Search failed: Bad or expired token. This can happen if the user revoked a token or the access token has expired. You should re-authenticate the user."
    const searchSource = vi.fn().mockResolvedValue({
      success: false,
      message,
    })

    const result = await searchTracksAcrossSources({
      context: mockContext,
      adapterService: adapterService as any,
      roomId,
      userId,
      query: "test",
      searchSource,
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.items).toEqual([])
    expect(result.authErrors).toEqual([{ source: "spotify", status: 401, message }])
    expect(publishMetadataAuthError).toHaveBeenCalled()
  })

  test("filters by effective access when service present", async () => {
    const tidal = {
      name: "tidal",
      api: { search: vi.fn() },
    } as unknown as MetadataSource
    adapterService.getRoomMetadataSources.mockResolvedValue(
      new Map([
        ["spotify", spotifySource],
        ["tidal", tidal],
      ]),
    )
    const context = {
      ...mockContext,
      metadataSourceAccess: {
        getEffectiveSourceIdsForUser: vi.fn().mockResolvedValue(["tidal"]),
      },
    } as unknown as AppContext

    const searchSource = vi.fn().mockResolvedValue({ success: true, data: [] })
    await searchTracksAcrossSources({
      context,
      adapterService: adapterService as any,
      roomId,
      userId,
      query: "x",
      searchSource,
    })

    expect(searchSource).toHaveBeenCalledTimes(1)
    expect(searchSource).toHaveBeenCalledWith(tidal, "x", undefined)
  })

  test("forwards playlistIds to searchSource for scoped local catalog users", async () => {
    const localSource = {
      name: "local",
      api: { search: vi.fn() },
    } as unknown as MetadataSource
    adapterService.getRoomMetadataSources.mockResolvedValue(new Map([["local", localSource]]))
    const context = {
      ...mockContext,
      metadataSourceAccess: {
        getEffectiveSourceIdsForUser: vi.fn().mockResolvedValue(["local"]),
        getLocalCatalogPlaylistIds: vi.fn().mockResolvedValue(["pl-shelf-1", "pl-shelf-2"]),
      },
    } as unknown as AppContext

    const searchSource = vi.fn().mockResolvedValue({
      success: true,
      data: [{ id: "in-shelf", title: "Scoped", artists: [], urls: [] }],
    })
    await searchTracksAcrossSources({
      context,
      adapterService: adapterService as any,
      roomId,
      userId,
      query: "loveless",
      searchSource,
    })

    expect(searchSource).toHaveBeenCalledWith(localSource, "loveless", {
      playlistIds: ["pl-shelf-1", "pl-shelf-2"],
    })
  })
})
