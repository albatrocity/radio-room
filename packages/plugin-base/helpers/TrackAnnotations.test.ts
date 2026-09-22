import { describe, expect, test, vi } from "vitest"
import {
  TrackAnnotations,
  parseSkipData,
  skipStorageKey,
} from "./TrackAnnotations"

describe("skipStorageKey", () => {
  test("prefixes track id", () => {
    expect(skipStorageKey("abc")).toBe("skipped:abc")
  })
})

describe("parseSkipData", () => {
  test("returns null for missing or invalid JSON", () => {
    expect(parseSkipData(null)).toBeNull()
    expect(parseSkipData("not-json")).toBeNull()
  })

  test("parses JSON objects", () => {
    expect(parseSkipData('{"voteCount":2}')).toEqual({ voteCount: 2 })
  })
})

describe("TrackAnnotations", () => {
  test("markSkipped writes storage and stamps now-playing pluginData", async () => {
    const storage = {
      set: vi.fn().mockResolvedValue(undefined),
      get: vi.fn(),
      mget: vi.fn(),
    }
    const nowPlaying = {
      mediaSource: { trackId: "t1" },
      title: "Song",
      pluginData: { other: { x: 1 } },
    }
    const api = {
      getNowPlaying: vi.fn().mockResolvedValue(nowPlaying),
      updatePlaylistTrack: vi.fn().mockResolvedValue(undefined),
    }

    const annotations = new TrackAnnotations({
      storage,
      api,
      roomId: "room-1",
      pluginName: "absent-dj",
    })

    const meta = { trackId: "t1", timestamp: 42 }
    await annotations.markSkipped("t1", meta)

    expect(storage.set).toHaveBeenCalledWith("skipped:t1", JSON.stringify(meta))
    expect(api.getNowPlaying).toHaveBeenCalledWith("room-1")
    expect(api.updatePlaylistTrack).toHaveBeenCalledWith("room-1", {
      ...nowPlaying,
      pluginData: {
        other: { x: 1 },
        "absent-dj": { skipped: true, skipData: meta },
      },
    })
  })

  test("markSkipped skips playlist update when nothing is playing", async () => {
    const storage = {
      set: vi.fn().mockResolvedValue(undefined),
      get: vi.fn(),
      mget: vi.fn(),
    }
    const api = {
      getNowPlaying: vi.fn().mockResolvedValue(null),
      updatePlaylistTrack: vi.fn(),
    }

    await new TrackAnnotations({
      storage,
      api,
      roomId: "room-1",
      pluginName: "playlist-democracy",
    }).markSkipped("t1", { trackId: "t1" })

    expect(storage.set).toHaveBeenCalled()
    expect(api.updatePlaylistTrack).not.toHaveBeenCalled()
  })

  test("enrichQueueItems returns skipped annotations in order", async () => {
    const storage = {
      set: vi.fn(),
      get: vi.fn(),
      mget: vi.fn().mockResolvedValue([JSON.stringify({ a: 1 }), null, "bad"]),
    }
    const api = {
      getNowPlaying: vi.fn(),
      updatePlaylistTrack: vi.fn(),
    }

    const items = [
      { mediaSource: { trackId: "a" } },
      { mediaSource: { trackId: "b" } },
      { mediaSource: { trackId: "c" } },
    ] as Parameters<TrackAnnotations["enrichQueueItems"]>[0]

    const result = await new TrackAnnotations({
      storage,
      api,
      roomId: "room-1",
      pluginName: "absent-dj",
    }).enrichQueueItems(items)

    expect(storage.mget).toHaveBeenCalledWith(["skipped:a", "skipped:b", "skipped:c"])
    expect(result).toEqual([{ skipped: true, skipData: { a: 1 } }, {}, {}])
  })

  test("enrichQueueItems returns [] for empty input without mget", async () => {
    const mget = vi.fn()
    const result = await new TrackAnnotations({
      storage: { set: vi.fn(), get: vi.fn(), mget },
      api: { getNowPlaying: vi.fn(), updatePlaylistTrack: vi.fn() },
      roomId: "room-1",
      pluginName: "absent-dj",
    }).enrichQueueItems([])

    expect(result).toEqual([])
    expect(mget).not.toHaveBeenCalled()
  })
})
