import { beforeEach, describe, expect, test, vi } from "vitest"
import type { AppContext } from "@repo/types"
import { getTrackPreview, listMediaItemTracks } from "./trackPreview"

vi.mock("../data", () => ({
  findRoom: vi.fn(),
}))

vi.mock("../data/trackPreviews", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../data/trackPreviews")>()
  return {
    ...actual,
    getCachedTrackPreview: vi.fn(async () => null),
    storeTrackPreview: vi.fn(async () => ({ success: true })),
    getInFlightPreviewGeneration: vi.fn(() => undefined),
    setInFlightPreviewGeneration: vi.fn(),
  }
})

vi.mock("@repo/adapter-bridge", () => ({
  getBridgeRpcClient: vi.fn(() => ({})),
  fetchLocalPlaylistTracks: vi.fn(async () => ({
    ok: true,
    tracks: [{ id: "t1", title: "Track 1", urls: [], artists: [], album: { id: "a", title: "A", urls: [], artists: [], releaseDate: "", releaseDatePrecision: "year", totalTracks: 1, label: "", images: [] }, duration: 180000, explicit: false, trackNumber: 1, discNumber: 1, popularity: 0, images: [] }],
  })),
  fetchTrackPreview: vi.fn(async () => ({
    ok: true,
    mimeType: "audio/mpeg",
    data: "abc",
    durationMs: 15000,
  })),
  checkLocalTrackPlaylistMembership: vi.fn(async () => ["pl-1"]),
}))

import {
  getCachedTrackPreview,
  storeTrackPreview,
} from "../data/trackPreviews"
import { fetchTrackPreview } from "@repo/adapter-bridge"

describe("trackPreview operations", () => {
  const roomId = "room1"
  const userId = "user1"
  const mockContext = {
    apiUrl: "https://api.example",
    redis: { pubClient: {} },
    pluginRegistry: {
      resolvePreviewableMediaItem: vi.fn(async () => ({
        playlistId: "pl-1",
        item: { mediaKey: "pm-1", name: "Test LP" },
      })),
    },
    metadataSourceAccess: {
      canAccess: vi.fn(async () => true),
      getLocalCatalogPlaylistIds: vi.fn(async () => ["pl-1"]),
    },
  } as unknown as AppContext

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getCachedTrackPreview).mockResolvedValue(null)
  })

  test("listMediaItemTracks returns tracks for previewable item", async () => {
    const result = await listMediaItemTracks({
      context: mockContext,
      roomId,
      userId,
      mediaKey: "pm-1",
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.tracks).toHaveLength(1)
      expect(result.tracks[0]?.source).toBe("local")
    }
  })

  test("listMediaItemTracks denies unknown mediaKey", async () => {
    vi.mocked(mockContext.pluginRegistry!.resolvePreviewableMediaItem!).mockResolvedValueOnce(null)
    const result = await listMediaItemTracks({
      context: mockContext,
      roomId,
      userId,
      mediaKey: "unknown",
    })
    expect(result).toEqual({ ok: false, message: "You can't preview that item" })
  })

  test("getTrackPreview generates and stores clip on cache miss", async () => {
    const result = await getTrackPreview({
      context: mockContext,
      roomId,
      userId,
      trackId: "t1",
      mediaKey: "pm-1",
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.cached).toBe(false)
      expect(result.url).toMatch(/^\/api\/rooms\/room1\/track-previews\//)
    }
    expect(fetchTrackPreview).toHaveBeenCalled()
    expect(storeTrackPreview).toHaveBeenCalled()
  })

  test("getTrackPreview returns cached url without RPC", async () => {
    vi.mocked(getCachedTrackPreview).mockResolvedValueOnce({
      trackId: "t1",
      data: "abc",
      mimeType: "audio/mpeg",
      previewId: "cached-id",
    })
    const result = await getTrackPreview({
      context: mockContext,
      roomId,
      userId,
      trackId: "t1",
      mediaKey: "pm-1",
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.cached).toBe(true)
      expect(result.url).toBe("/api/rooms/room1/track-previews/cached-id")
    }
    expect(fetchTrackPreview).not.toHaveBeenCalled()
  })

  test("getTrackPreview denies track not on playlist", async () => {
    const { fetchLocalPlaylistTracks } = await import("@repo/adapter-bridge")
    vi.mocked(fetchLocalPlaylistTracks).mockResolvedValueOnce({
      ok: true,
      tracks: [{ id: "other", title: "Other", urls: [], artists: [], album: { id: "a", title: "A", urls: [], artists: [], releaseDate: "", releaseDatePrecision: "year", totalTracks: 1, label: "", images: [] }, duration: 0, explicit: false, trackNumber: 1, discNumber: 1, popularity: 0, images: [] }],
    })
    const result = await getTrackPreview({
      context: mockContext,
      roomId,
      userId,
      trackId: "t1",
      mediaKey: "pm-1",
    })
    expect(result).toEqual({ ok: false, message: "You can't preview that track" })
  })
})
