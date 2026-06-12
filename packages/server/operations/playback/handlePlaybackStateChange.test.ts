import { describe, expect, test, vi, beforeEach } from "vitest"
import { handlePlaybackStateChange, playbackStateFromIsPlaying } from "./handlePlaybackStateChange"
import type { AppContext } from "@repo/types"

function createMockContext(): AppContext {
  const store = new Map<string, string>()

  return {
    redis: {
      pubClient: {
        get: vi.fn(async (key: string) => store.get(key) ?? null),
        set: vi.fn(async (key: string, value: string) => {
          store.set(key, value)
          return "OK"
        }),
      },
    },
    systemEvents: {
      emit: vi.fn().mockResolvedValue(undefined),
    },
  } as unknown as AppContext
}

describe("handlePlaybackStateChange", () => {
  let context: AppContext

  beforeEach(() => {
    context = createMockContext()
    vi.clearAllMocks()
  })

  test("emits event on first call", async () => {
    const result = await handlePlaybackStateChange({
      context,
      roomId: "room-1",
      state: "playing",
      trackId: "track-abc",
    })

    expect(result.emitted).toBe(true)
    expect(context.systemEvents!.emit).toHaveBeenCalledWith(
      "room-1",
      "PLAYBACK_STATE_CHANGED",
      {
        roomId: "room-1",
        state: "playing",
        trackId: "track-abc",
      },
    )
  })

  test("dedupes repeated same-state calls", async () => {
    await handlePlaybackStateChange({
      context,
      roomId: "room-1",
      state: "paused",
    })

    vi.mocked(context.systemEvents!.emit).mockClear()

    const result = await handlePlaybackStateChange({
      context,
      roomId: "room-1",
      state: "paused",
    })

    expect(result.emitted).toBe(false)
    expect(context.systemEvents!.emit).not.toHaveBeenCalled()
  })

  test("emits on state transition", async () => {
    await handlePlaybackStateChange({
      context,
      roomId: "room-1",
      state: "playing",
    })

    vi.mocked(context.systemEvents!.emit).mockClear()

    const result = await handlePlaybackStateChange({
      context,
      roomId: "room-1",
      state: "paused",
      trackId: "track-xyz",
    })

    expect(result.emitted).toBe(true)
    expect(context.systemEvents!.emit).toHaveBeenCalledWith(
      "room-1",
      "PLAYBACK_STATE_CHANGED",
      {
        roomId: "room-1",
        state: "paused",
        trackId: "track-xyz",
      },
    )
  })

  test("handles null trackId", async () => {
    const result = await handlePlaybackStateChange({
      context,
      roomId: "room-1",
      state: "stopped",
    })

    expect(result.emitted).toBe(true)
    expect(context.systemEvents!.emit).toHaveBeenCalledWith(
      "room-1",
      "PLAYBACK_STATE_CHANGED",
      {
        roomId: "room-1",
        state: "stopped",
        trackId: null,
      },
    )
  })

  test("isolates state per room", async () => {
    await handlePlaybackStateChange({
      context,
      roomId: "room-1",
      state: "playing",
    })

    vi.mocked(context.systemEvents!.emit).mockClear()

    const result = await handlePlaybackStateChange({
      context,
      roomId: "room-2",
      state: "playing",
    })

    expect(result.emitted).toBe(true)
    expect(context.systemEvents!.emit).toHaveBeenCalledWith(
      "room-2",
      "PLAYBACK_STATE_CHANGED",
      expect.objectContaining({ roomId: "room-2" }),
    )
  })

  test("returns emitted: false when systemEvents not available", async () => {
    const noEventsContext = { ...context, systemEvents: undefined } as AppContext

    const result = await handlePlaybackStateChange({
      context: noEventsContext,
      roomId: "room-1",
      state: "playing",
    })

    expect(result.emitted).toBe(false)
  })
})

describe("playbackStateFromIsPlaying", () => {
  test("returns playing when true", () => {
    expect(playbackStateFromIsPlaying(true)).toBe("playing")
  })

  test("returns paused when false", () => {
    expect(playbackStateFromIsPlaying(false)).toBe("paused")
  })
})
