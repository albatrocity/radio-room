import { describe, expect, test, vi } from "vitest"
import type { AppContext } from "@repo/types"
import type { Server } from "socket.io"
import { DJService } from "../../services/DJService"
import { SystemEvents } from "../SystemEvents"
import { PluginAPIImpl } from "./PluginAPI"
import { PluginQueueAPI } from "./PluginQueueAPI"
import { QueueMutationDuringEmitError } from "./QueueMutationDuringEmitError"

vi.mock("../../services/DJService", () => ({
  DJService: vi.fn(function MockDJService() {
    return {
      queueSongAs: vi.fn(async () => ({ success: true, queuedItem: { track: { id: "t" } } })),
      removeTrackFromQueue: vi.fn(async () => ({ success: true })),
      moveTrackToQueueTop: vi.fn(async () => ({ success: true })),
      moveTrackToQueueBottom: vi.fn(async () => ({ success: true })),
      moveTrackByPosition: vi.fn(async () => ({ success: true })),
      shuffleQueue: vi.fn(async () => ({ success: true })),
      enqueueTracks: vi.fn(async () => ({ success: true, queued: [], skipped: [] })),
      setQueueSplit: vi.fn(async () => ({ success: true })),
      removeQueueSplit: vi.fn(async () => ({ success: true })),
      unpinQueueBlock: vi.fn(async () => ({ success: true })),
      skipTrack: vi.fn(async () => {}),
    }
  }),
}))

describe("PluginAPI queue mutation guard", () => {
  test("queue mutators throw from a QUEUE_CHANGED handler and work again after emit", async () => {
    const redis = { pubClient: { publish: vi.fn(async () => 1) } }
    const thrown: unknown[] = []
    let queue!: PluginQueueAPI
    const registry = {
      emit: async (roomId: string) => {
        const calls = [
          () => queue.addToTrackQueue(roomId, "track-1"),
          () => queue.removeFromTrackQueue(roomId, "track-1"),
          () => queue.moveToTrackQueueTop(roomId, "track-1"),
          () => queue.moveToTrackQueueBottom(roomId, "track-1"),
          () => queue.moveTrackByPosition(roomId, "track-1", 1),
          () => queue.shuffleTrackQueue(roomId),
          () => queue.enqueueTracks(roomId, [{ trackId: "track-1" }]),
          () => queue.setQueueSplit(roomId, "spotify:track-1"),
          () => queue.removeQueueSplit(roomId),
          () => queue.unpinQueueBlock(roomId, "block-1"),
        ]
        for (const call of calls) {
          try {
            await call()
          } catch (error) {
            thrown.push(error)
          }
        }
      },
    }
    const systemEvents = new SystemEvents(redis as never, registry as never)
    queue = new PluginQueueAPI(
      new PluginAPIImpl({ systemEvents } as unknown as AppContext, {} as Server).forPlugin(
        "round-robin-dj",
        "room-1",
      ),
    )

    await systemEvents.emit("room-1", "QUEUE_CHANGED", {
      roomId: "room-1",
      queue: [],
      splitKey: null,
    })

    expect(thrown).toHaveLength(10)
    expect(thrown.every((error) => error instanceof QueueMutationDuringEmitError)).toBe(true)
    expect(systemEvents.isEmittingToPlugins("room-1")).toBe(false)

    await expect(queue.addToTrackQueue("room-1", "track-1")).resolves.toEqual(
      expect.objectContaining({ success: true }),
    )
  })

  test("skipTrack from a plugin handler runs after emit", async () => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    const redis = { pubClient: { publish: vi.fn(async () => 1) } }
    let queue!: PluginQueueAPI
    const registry = {
      emit: async (roomId: string) => {
        await queue.skipTrack(roomId, "track-1")
      },
    }
    const systemEvents = new SystemEvents(redis as never, registry as never)
    queue = new PluginQueueAPI(
      new PluginAPIImpl({ systemEvents } as unknown as AppContext, {} as Server).forPlugin(
        "playlist-democracy",
        "room-1",
      ),
    )

    await systemEvents.emit("room-1", "REACTION_ADDED", {
      roomId: "room-1",
      userId: "user-1",
      emoji: "skip",
      reactTo: { type: "track", trackId: "track-1" },
    } as never)

    expect(vi.mocked(DJService)).not.toHaveBeenCalled()
    await vi.runAllTimersAsync()
    expect(vi.mocked(DJService)).toHaveBeenCalled()
    const instance = vi.mocked(DJService).mock.results.at(-1)?.value as {
      skipTrack: ReturnType<typeof vi.fn>
    }
    expect(instance.skipTrack).toHaveBeenCalledWith("room-1", "track-1", {
      actorPluginName: "playlist-democracy",
    })
    vi.useRealTimers()
  })
})
