import { describe, expect, it, vi } from "vitest"
import {
  parseNowPlayingPayload,
  shouldAcceptNowPlaying,
  trackMetaFromPayload,
  startRedisNowPlayingSubscriber,
} from "./redisNowPlaying.js"

describe("parseNowPlayingPayload", () => {
  it("parses valid JSON and rejects junk", () => {
    expect(parseNowPlayingPayload('{"title":"X","roomId":"r1"}')).toEqual({
      title: "X",
      roomId: "r1",
    })
    expect(parseNowPlayingPayload("not-json")).toBeNull()
  })
})

describe("shouldAcceptNowPlaying", () => {
  it("requires a non-empty title", () => {
    expect(shouldAcceptNowPlaying({ title: "  " }, null)).toBe(false)
    expect(shouldAcceptNowPlaying({ title: "Song" }, null)).toBe(true)
  })

  it("filters by room id when configured", () => {
    expect(shouldAcceptNowPlaying({ title: "Song", roomId: "a" }, "a")).toBe(true)
    expect(shouldAcceptNowPlaying({ title: "Song", roomId: "b" }, "a")).toBe(false)
    expect(shouldAcceptNowPlaying({ title: "Song", roomId: "b" }, null)).toBe(true)
  })
})

describe("trackMetaFromPayload", () => {
  it("trims fields", () => {
    expect(
      trackMetaFromPayload({ title: " T ", artist: " A ", album: " Al " }),
    ).toEqual({ title: "T", artist: "A", album: "Al" })
  })
})

describe("startRedisNowPlayingSubscriber", () => {
  it("forwards accepted channel messages", async () => {
    const handlers = new Map<string, (message: string) => void>()
    const client = {
      on: vi.fn(),
      connect: vi.fn(async () => undefined),
      subscribe: vi.fn(async (channel: string, cb: (message: string) => void) => {
        handlers.set(channel, cb)
      }),
      unsubscribe: vi.fn(async () => undefined),
      quit: vi.fn(async () => undefined),
      disconnect: vi.fn(async () => undefined),
    }

    const onTrack = vi.fn()
    const sub = await startRedisNowPlayingSubscriber({
      redisUrl: "redis://example",
      roomId: "room-1",
      onTrack,
      createRedisClient: () => client as never,
    })

    handlers.get("SYSTEM:NOW_PLAYING_CHANGED")?.(
      JSON.stringify({
        roomId: "room-1",
        title: "Bridge Track",
        artist: "Artist",
        album: "Album",
      }),
    )
    handlers.get("SYSTEM:NOW_PLAYING_CHANGED")?.(
      JSON.stringify({
        roomId: "other",
        title: "Ignored",
        artist: "x",
        album: "y",
      }),
    )

    expect(onTrack).toHaveBeenCalledTimes(1)
    expect(onTrack).toHaveBeenCalledWith(
      { title: "Bridge Track", artist: "Artist", album: "Album" },
      "room-1",
    )

    await sub.stop()
    expect(client.quit).toHaveBeenCalled()
  })
})
