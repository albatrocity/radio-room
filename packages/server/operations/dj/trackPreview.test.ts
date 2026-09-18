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
    storePreviewIdRedirect: vi.fn(async () => undefined),
  }
})

const mediaCacheMocks = vi.hoisted(() => ({
  getPreviewPointer: vi.fn(async () => null),
  headPreviewByFingerprint: vi.fn(async () => null),
  ensurePreviewObject: vi.fn(async () => ({
    url: "https://cdn.example/media/previews/v1/fp.mp3",
    uploaded: true,
  })),
}))

vi.mock("../../services/MediaObjectCache", () => mediaCacheMocks)

vi.mock("../bridge/bridgeDaemonId", () => ({
  resolveMediaLibraryId: vi.fn(async () => "daemon-1"),
}))

vi.mock("@repo/adapter-bridge", () => ({
  getBridgeRpcClient: vi.fn(() => ({})),
  fetchLocalPlaylistTracks: vi.fn(async () => ({
    ok: true,
    tracks: [
      {
        id: "t1",
        title: "Track 1",
        urls: [],
        artists: [{ id: "ar", title: "Artist", urls: [] }],
        album: {
          id: "a",
          title: "A",
          urls: [],
          artists: [],
          releaseDate: "",
          releaseDatePrecision: "year",
          totalTracks: 1,
          label: "",
          images: [],
        },
        duration: 180000,
        explicit: false,
        trackNumber: 1,
        discNumber: 1,
        popularity: 0,
        images: [],
      },
    ],
  })),
  fetchLocalAlbumResult: vi.fn(async () => null),
  fetchTrackPreview: vi.fn(async () => ({
    ok: true,
    mimeType: "audio/mpeg",
    data: "abc",
    durationMs: 15000,
  })),
  checkLocalTrackPlaylistMembership: vi.fn(async () => ({
    playlistIds: ["pl-1"],
    albumIds: [],
  })),
}))

import { storePreviewIdRedirect } from "../data/trackPreviews"
import { fetchTrackPreview } from "@repo/adapter-bridge"

describe("trackPreview operations", () => {
  const roomId = "room1"
  const userId = "user1"
  const mockContext = {
    apiUrl: "https://api.example",
    redis: { pubClient: {} },
    pluginRegistry: {
      resolvePreviewableMediaItem: vi.fn(async () => ({
        kind: "playlist" as const,
        playlistId: "pl-1",
        item: { mediaKey: "pm-1", name: "Test LP" },
      })),
    },
    metadataSourceAccess: {
      canAccess: vi.fn(async () => true),
      getLocalCatalogShelves: vi.fn(async () => ({ playlistIds: ["pl-1"], albumIds: [] })),
    },
  } as unknown as AppContext

  beforeEach(() => {
    vi.clearAllMocks()
    mediaCacheMocks.getPreviewPointer.mockResolvedValue(null)
    mediaCacheMocks.headPreviewByFingerprint.mockResolvedValue(null)
    mediaCacheMocks.ensurePreviewObject.mockResolvedValue({
      url: "https://cdn.example/media/previews/v1/fp.mp3",
      uploaded: true,
    })
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
      expect(result.url).toBe("https://cdn.example/media/previews/v1/fp.mp3")
    }
    expect(fetchTrackPreview).toHaveBeenCalled()
    expect(mediaCacheMocks.ensurePreviewObject).toHaveBeenCalled()
    expect(storePreviewIdRedirect).toHaveBeenCalled()
  })

  test("getTrackPreview returns cached url without RPC", async () => {
    mediaCacheMocks.getPreviewPointer.mockResolvedValueOnce({
      url: "https://cdn.example/cached.mp3",
      mimeType: "audio/mpeg",
      durationMs: 15000,
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
      expect(result.url).toBe("https://cdn.example/cached.mp3")
    }
    expect(fetchTrackPreview).not.toHaveBeenCalled()
  })

  test("getTrackPreview denies track not on playlist", async () => {
    const { fetchLocalPlaylistTracks } = await import("@repo/adapter-bridge")
    vi.mocked(fetchLocalPlaylistTracks).mockResolvedValueOnce({
      ok: true,
      tracks: [
        {
          id: "other",
          title: "Other",
          urls: [],
          artists: [],
          album: {
            id: "a",
            title: "A",
            urls: [],
            artists: [],
            releaseDate: "",
            releaseDatePrecision: "year",
            totalTracks: 1,
            label: "",
            images: [],
          },
          duration: 0,
          explicit: false,
          trackNumber: 1,
          discNumber: 1,
          popularity: 0,
          images: [],
        },
      ],
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

  test("getTrackPreview returns clip errors instead of throwing", async () => {
    vi.mocked(fetchTrackPreview).mockResolvedValueOnce({
      ok: false,
      error:
        "ffmpeg was not found (checked PATH, /opt/homebrew/bin/ffmpeg, /usr/local/bin/ffmpeg). Install ffmpeg on the DJ Mac to enable track previews.",
    })
    const result = await getTrackPreview({
      context: mockContext,
      roomId,
      userId,
      trackId: "t1",
      mediaKey: "pm-1",
    })
    expect(result).toEqual({
      ok: false,
      message:
        "ffmpeg was not found (checked PATH, /opt/homebrew/bin/ffmpeg, /usr/local/bin/ffmpeg). Install ffmpeg on the DJ Mac to enable track previews.",
    })
  })
})
