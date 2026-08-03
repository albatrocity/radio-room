import { beforeEach, describe, expect, test, vi } from "vitest"
import type { AppContext, MetadataSource } from "@repo/types"
import {
  browseAlbum,
  browseArtists,
  getEffectiveMetadataSources,
  resolveBrowseSource,
} from "./browseCatalog"

vi.mock("../data", () => ({
  findRoom: vi.fn(),
}))

import { findRoom } from "../data"

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
})
