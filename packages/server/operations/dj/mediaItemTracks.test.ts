import { beforeEach, describe, expect, test, vi } from "vitest"
import {
  BRIDGE_TRACK_LISTING_FAILED_MESSAGE,
  BRIDGE_UNREACHABLE_MESSAGE,
  fetchResolvedMediaItemTracks,
} from "./mediaItemTracks"

vi.mock("@repo/adapter-bridge", () => ({
  getBridgeRpcClient: vi.fn(() => ({})),
  fetchLocalPlaylistTracks: vi.fn(async () => ({ ok: true, tracks: [] })),
  fetchLocalAlbumResult: vi.fn(async () => null),
}))

import {
  fetchLocalAlbumResult,
  fetchLocalPlaylistTracks,
  getBridgeRpcClient,
} from "@repo/adapter-bridge"

describe("fetchResolvedMediaItemTracks", () => {
  const params = {
    roomId: "room1",
    source: { kind: "playlist" as const, playlistId: "nd-secret" },
    logLabel: "test",
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getBridgeRpcClient).mockReturnValue({} as any)
  })

  test("tags every track with the local source", async () => {
    vi.mocked(fetchLocalPlaylistTracks).mockResolvedValueOnce({
      ok: true,
      tracks: [{ id: "t1" }, { id: "t2" }] as any,
    })

    const result = await fetchResolvedMediaItemTracks(params)

    expect(fetchLocalPlaylistTracks).toHaveBeenCalledWith({
      rpc: {},
      playlistId: "nd-secret",
      roomId: "room1",
      cache: undefined,
    })
    expect(result).toEqual({
      ok: true,
      tracks: [
        { id: "t1", source: "local" },
        { id: "t2", source: "local" },
      ],
    })
  })

  test("reports an unlinked bridge separately from a failed listing", async () => {
    vi.mocked(getBridgeRpcClient).mockReturnValueOnce(undefined as any)
    await expect(fetchResolvedMediaItemTracks(params)).resolves.toEqual({
      ok: false,
      message: BRIDGE_UNREACHABLE_MESSAGE,
    })

    vi.mocked(fetchLocalPlaylistTracks).mockResolvedValueOnce({
      ok: false,
      error: "Bridge RPC timeout: listPlaylistTracks",
    })
    await expect(fetchResolvedMediaItemTracks(params)).resolves.toEqual({
      ok: false,
      message: BRIDGE_TRACK_LISTING_FAILED_MESSAGE,
    })
  })

  test("surfaces an unexpected throw as a failure", async () => {
    vi.mocked(fetchLocalPlaylistTracks).mockRejectedValueOnce(new Error("boom"))
    await expect(fetchResolvedMediaItemTracks(params)).resolves.toEqual({
      ok: false,
      message: "boom",
    })
  })

  test("lists album tracks via fetchLocalAlbumResult (cached getAlbum)", async () => {
    const cache = { get: vi.fn(), set: vi.fn() } as any
    vi.mocked(fetchLocalAlbumResult).mockResolvedValueOnce({
      album: { id: "al-1", title: "A", artists: [], images: [] },
      tracks: [{ id: "a1" }, { id: "a2" }],
    } as any)

    const result = await fetchResolvedMediaItemTracks({
      roomId: "room1",
      source: { kind: "album", albumId: "al-1" },
      logLabel: "test",
      cache,
    })

    expect(fetchLocalAlbumResult).toHaveBeenCalledWith({
      rpc: {},
      albumId: "al-1",
      roomId: "room1",
      cache,
    })
    expect(result).toEqual({
      ok: true,
      tracks: [
        { id: "a1", source: "local" },
        { id: "a2", source: "local" },
      ],
    })
  })

  test("fails when album fetch returns no tracks", async () => {
    vi.mocked(fetchLocalAlbumResult).mockResolvedValueOnce(null)
    await expect(
      fetchResolvedMediaItemTracks({
        roomId: "room1",
        source: { kind: "album", albumId: "al-1" },
        logLabel: "test",
      }),
    ).resolves.toEqual({
      ok: false,
      message: BRIDGE_TRACK_LISTING_FAILED_MESSAGE,
    })
  })
})
