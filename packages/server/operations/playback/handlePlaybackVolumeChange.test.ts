import { describe, expect, test, vi, beforeEach } from "vitest"
import {
  handlePlaybackVolumeChange,
  PLAYBACK_VOLUME_CHANGE_THRESHOLD,
} from "./handlePlaybackVolumeChange"
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

describe("handlePlaybackVolumeChange", () => {
  let context: AppContext

  beforeEach(() => {
    context = createMockContext()
    vi.clearAllMocks()
  })

  test("emits event on first call", async () => {
    const result = await handlePlaybackVolumeChange({
      context,
      roomId: "room-1",
      volumePercent: 75,
    })

    expect(result.emitted).toBe(true)
    expect(context.systemEvents!.emit).toHaveBeenCalledWith(
      "room-1",
      "PLAYBACK_VOLUME_CHANGED",
      {
        roomId: "room-1",
        volumePercent: 75,
      },
    )
  })

  test("dedupes repeated same-volume calls", async () => {
    await handlePlaybackVolumeChange({
      context,
      roomId: "room-1",
      volumePercent: 50,
    })

    vi.mocked(context.systemEvents!.emit).mockClear()

    const result = await handlePlaybackVolumeChange({
      context,
      roomId: "room-1",
      volumePercent: 50,
    })

    expect(result.emitted).toBe(false)
    expect(context.systemEvents!.emit).not.toHaveBeenCalled()
  })

  test("suppresses changes below threshold", async () => {
    await handlePlaybackVolumeChange({
      context,
      roomId: "room-1",
      volumePercent: 50,
    })

    vi.mocked(context.systemEvents!.emit).mockClear()

    const result = await handlePlaybackVolumeChange({
      context,
      roomId: "room-1",
      volumePercent: 50 + PLAYBACK_VOLUME_CHANGE_THRESHOLD - 1,
    })

    expect(result.emitted).toBe(false)
    expect(context.systemEvents!.emit).not.toHaveBeenCalled()
  })

  test("emits when delta meets threshold", async () => {
    await handlePlaybackVolumeChange({
      context,
      roomId: "room-1",
      volumePercent: 50,
    })

    vi.mocked(context.systemEvents!.emit).mockClear()

    const result = await handlePlaybackVolumeChange({
      context,
      roomId: "room-1",
      volumePercent: 50 + PLAYBACK_VOLUME_CHANGE_THRESHOLD,
    })

    expect(result.emitted).toBe(true)
    expect(context.systemEvents!.emit).toHaveBeenCalledWith(
      "room-1",
      "PLAYBACK_VOLUME_CHANGED",
      {
        roomId: "room-1",
        volumePercent: 52,
      },
    )
  })

  test("clamps volume to 0-100", async () => {
    const result = await handlePlaybackVolumeChange({
      context,
      roomId: "room-1",
      volumePercent: 150,
    })

    expect(result.emitted).toBe(true)
    expect(context.systemEvents!.emit).toHaveBeenCalledWith(
      "room-1",
      "PLAYBACK_VOLUME_CHANGED",
      {
        roomId: "room-1",
        volumePercent: 100,
      },
    )
  })

  test("isolates volume per room", async () => {
    await handlePlaybackVolumeChange({
      context,
      roomId: "room-1",
      volumePercent: 30,
    })

    vi.mocked(context.systemEvents!.emit).mockClear()

    const result = await handlePlaybackVolumeChange({
      context,
      roomId: "room-2",
      volumePercent: 30,
    })

    expect(result.emitted).toBe(true)
    expect(context.systemEvents!.emit).toHaveBeenCalledWith(
      "room-2",
      "PLAYBACK_VOLUME_CHANGED",
      expect.objectContaining({ roomId: "room-2" }),
    )
  })

  test("returns emitted: false when systemEvents not available", async () => {
    const noEventsContext = { ...context, systemEvents: undefined } as AppContext

    const result = await handlePlaybackVolumeChange({
      context: noEventsContext,
      roomId: "room-1",
      volumePercent: 50,
    })

    expect(result.emitted).toBe(false)
  })
})
