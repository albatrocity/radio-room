import { beforeEach, describe, expect, test, vi } from "vitest"
import type { AppContext, MetadataSource } from "@repo/types"
import {
  browseAlbum,
  browseArtists,
  browseMediaItem,
  getEffectiveMetadataSources,
  resolveBrowseSource,
} from "./browseCatalog"

vi.mock("../data", () => ({
  findRoom: vi.fn(),
}))

vi.mock("@repo/adapter-bridge", () => ({
  getBridgeRpcClient: vi.fn(() => ({})),
  fetchLocalPlaylistTracks: vi.fn(async () => ({ ok: true, tracks: [] })),
}))

import { findRoom } from "../data"
import { fetchLocalPlaylistTracks, getBridgeRpcClient } from "@repo/adapter-bridge"

describe("browseCatalog operations", () => {
  const roomId = "room1"
  const userId = "user1"
  const listArtists = vi.fn()
  const getAlbum = vi.fn()

  const localSource = {
    name: "local",
    api: {
      listArtists,
      listAlbums: vi.fn(),
      getArtist: vi.fn(),
      getAlbum,
      getBrowseCapabilities: () => ({ entryMode: "index", albumSearch: true }),
    },
  } as unknown as MetadataSource

  const spotifySource = {
    name: "spotify",
    api: {
      search: vi.fn(),
    },
  } as unknown as MetadataSource

  const adapterService = {
    getRoomMetadataSources: vi.fn(),
  }

  const mockContext = {
    metadataSourceAccess: undefined,
  } as unknown as AppContext

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(findRoom).mockResolvedValue({
      id: roomId,
      creator: "creator1",
      metadataSourceIds: ["spotify", "local"],
    } as any)
    adapterService.getRoomMetadataSources.mockResolvedValue(
      new Map([
        ["spotify", spotifySource],
        ["local", localSource],
      ]),
    )
    listArtists.mockResolvedValue({
      items: [{ id: "a1", title: "Artist One" }],
      total: 1,
    })
    getAlbum.mockResolvedValue({
      album: { id: "al1", title: "Album", artists: [] },
      tracks: [{ id: "t1", title: "Track", artists: [], urls: [] }],
    })
  })

  test("getEffectiveMetadataSources marks browseable sources", async () => {
    const result = await getEffectiveMetadataSources({
      context: mockContext,
      adapterService: adapterService as any,
      roomId,
      userId,
    })
    expect(result.metadataSourceIds).toEqual(["spotify", "local"])
    expect(result.browseableSourceIds).toEqual(["local"])
    expect(result.browseSourceCapabilities.local).toEqual({
      entryMode: "index",
      albumSearch: true,
    })
    expect(result.myMedia).toEqual([])
  })

  test("getEffectiveMetadataSources includes myMedia items when local is effective", async () => {
    const listPhysicalMediaItems = vi.fn().mockResolvedValue([
      { mediaKey: "pm-1", name: "LP: Loveless" },
    ])
    const context = {
      metadataSourceAccess: undefined,
      pluginRegistry: { listPhysicalMediaItems },
    } as unknown as AppContext

    const result = await getEffectiveMetadataSources({
      context,
      adapterService: adapterService as any,
      roomId,
      userId,
    })
    expect(listPhysicalMediaItems).toHaveBeenCalledWith({ roomId, userId })
    expect(result.myMedia).toEqual([{ mediaKey: "pm-1", name: "LP: Loveless" }])
  })

  test("resolveBrowseSource denies when access rejects", async () => {
    const context = {
      metadataSourceAccess: {
        canAccess: vi.fn().mockResolvedValue(false),
      },
    } as unknown as AppContext

    await expect(
      resolveBrowseSource({
        context,
        adapterService: adapterService as any,
        roomId,
        userId,
        source: "local",
      }),
    ).resolves.toEqual({
      ok: false,
      message: "You do not have access to this metadata source",
    })
  })

  test("browseArtists returns items", async () => {
    const result = await browseArtists({
      context: mockContext,
      adapterService: adapterService as any,
      roomId,
      userId,
      source: "local",
      query: "art",
    })
    expect(result).toEqual({
      ok: true,
      source: "local",
      items: [{ id: "a1", title: "Artist One" }],
      total: 1,
    })
  })

  test("browseArtists maps Spotify gateway dumps to a retryable client message", async () => {
    listArtists.mockRejectedValueOnce(
      new Error(
        'Unrecognised response code: 502 - Bad Gateway. Body: {"error": {"status": 502, "message": "An unexpected error occurred. Please try again later." } }',
      ),
    )
    const result = await browseArtists({
      context: mockContext,
      adapterService: adapterService as any,
      roomId,
      userId,
      source: "local",
      query: "art",
    })
    expect(result).toEqual({
      ok: false,
      message: "This catalog is temporarily unavailable. Please try again.",
    })
  })

  test("browseAlbum tags tracks with source", async () => {
    const result = await browseAlbum({
      context: mockContext,
      adapterService: adapterService as any,
      roomId,
      userId,
      source: "local",
      albumId: "al1",
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.tracks[0]).toEqual(expect.objectContaining({ id: "t1", source: "local" }))
  })

  test("browseMediaItem resolves mediaKey from held grants and never uses a client playlist id", async () => {
    const resolvePhysicalMediaItem = vi.fn().mockResolvedValue({
      kind: "playlist",
      playlistId: "nd-secret",
      item: { mediaKey: "pm-1", name: "LP: Loveless" },
    })
    vi.mocked(getBridgeRpcClient).mockReturnValue({} as any)
    vi.mocked(fetchLocalPlaylistTracks).mockResolvedValue({
      ok: true,
      tracks: [{ id: "t1", title: "Track", artists: [], urls: [] } as any],
    })

    const context = {
      metadataSourceAccess: {
        canAccess: vi.fn().mockResolvedValue(true),
      },
      pluginRegistry: { resolvePhysicalMediaItem },
    } as unknown as AppContext

    const result = await browseMediaItem({
      context,
      roomId,
      userId,
      mediaKey: "pm-1",
    })

    expect(resolvePhysicalMediaItem).toHaveBeenCalledWith({
      roomId,
      userId,
      mediaKey: "pm-1",
    })
    expect(fetchLocalPlaylistTracks).toHaveBeenCalledWith({
      rpc: {},
      playlistId: "nd-secret",
      roomId: "room1",
      cache: undefined,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.mediaKey).toBe("pm-1")
    expect(result.name).toBe("LP: Loveless")
    expect(result.tracks[0]).toEqual(expect.objectContaining({ id: "t1", source: "local" }))
  })

  test("browseMediaItem reports a bridge failure instead of an empty track list", async () => {
    vi.mocked(getBridgeRpcClient).mockReturnValue({} as any)
    vi.mocked(fetchLocalPlaylistTracks).mockResolvedValue({
      ok: false,
      error: "Bridge RPC timeout: listPlaylistTracks",
    })

    const context = {
      metadataSourceAccess: { canAccess: vi.fn().mockResolvedValue(true) },
      pluginRegistry: {
        resolvePhysicalMediaItem: vi.fn().mockResolvedValue({
          kind: "playlist",
          playlistId: "nd-secret",
          item: { mediaKey: "pm-1", name: "LP: Loveless" },
        }),
      },
    } as unknown as AppContext

    const result = await browseMediaItem({ context, roomId, userId, mediaKey: "pm-1" })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toMatch(/Media Bridge/)
  })

  test("browseMediaItem denies when the caller does not hold the item", async () => {
    const context = {
      metadataSourceAccess: {
        canAccess: vi.fn().mockResolvedValue(true),
      },
      pluginRegistry: { resolvePhysicalMediaItem: vi.fn().mockResolvedValue(null) },
    } as unknown as AppContext

    await expect(
      browseMediaItem({
        context,
        roomId,
        userId,
        mediaKey: "pm-forged",
      }),
    ).resolves.toEqual({
      ok: false,
      message: "You don't have that item",
    })
  })
})
