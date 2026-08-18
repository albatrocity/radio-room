import { describe, it, expect, vi } from "vitest"
import type { Plugin, QueueItem } from "@repo/types"
import { PluginLifecycleImpl } from "./PluginLifecycle"
import { PluginRegistry } from "./PluginRegistry"

function createQueueItem(trackId = "track-1"): QueueItem {
  return {
    title: "Test Track",
    mediaSource: { type: "spotify", trackId },
    track: {
      id: trackId,
      title: "Test Track",
      artists: [{ title: "Artist" }],
      album: { title: "Album" },
      duration: 180_000,
    },
    addedAt: Date.now(),
    addedBy: { userId: "u1", username: "U" },
  } as QueueItem
}

function seedRoomPlugin(registry: PluginRegistry, roomId: string, plugin: Plugin): void {
  const roomPlugins = (registry as unknown as { roomPlugins: Map<string, Map<string, unknown>> })
    .roomPlugins
  if (!roomPlugins.has(roomId)) {
    roomPlugins.set(roomId, new Map())
  }
  roomPlugins.get(roomId)!.set(plugin.name, {
    plugin,
    lifecycle: new PluginLifecycleImpl(),
  })
}

function stubPlugin(name: string, extra: Partial<Plugin>): Plugin {
  return {
    name,
    version: "1.0.0",
    register: vi.fn(),
    cleanup: vi.fn(),
    ...extra,
  } satisfies Plugin
}

describe("PluginRegistry.cancelHeldQueue", () => {
  it("returns the first cancelled: true", async () => {
    const registry = new PluginRegistry({} as never, {} as never)
    const first = vi.fn(async () => ({ cancelled: false }))
    const second = vi.fn(async () => ({ cancelled: true }))
    const third = vi.fn(async () => ({ cancelled: true }))
    seedRoomPlugin(registry, "room1", stubPlugin("first", { cancelHeldQueue: first }))
    seedRoomPlugin(registry, "room1", stubPlugin("second", { cancelHeldQueue: second }))
    seedRoomPlugin(registry, "room1", stubPlugin("third", { cancelHeldQueue: third }))

    await expect(
      registry.cancelHeldQueue({ roomId: "room1", userId: "u1", trackId: "t1" }),
    ).resolves.toEqual({ cancelled: true })
    expect(first).toHaveBeenCalled()
    expect(second).toHaveBeenCalled()
    expect(third).not.toHaveBeenCalled()
  })

  it("fail-opens when a plugin throws", async () => {
    const registry = new PluginRegistry({} as never, {} as never)
    seedRoomPlugin(
      registry,
      "room1",
      stubPlugin("first", {
        cancelHeldQueue: async () => {
          throw new Error("boom")
        },
      }),
    )
    seedRoomPlugin(
      registry,
      "room1",
      stubPlugin("second", { cancelHeldQueue: async () => ({ cancelled: true }) }),
    )

    await expect(
      registry.cancelHeldQueue({ roomId: "room1", userId: "u1", trackId: "t1" }),
    ).resolves.toEqual({ cancelled: true })
  })
})

describe("PluginRegistry.notifyQueueItemRemoved", () => {
  it("calls all plugins implementing the hook", async () => {
    const registry = new PluginRegistry({} as never, {} as never)
    const first = vi.fn(async () => undefined)
    const second = vi.fn(async () => undefined)
    seedRoomPlugin(registry, "room1", stubPlugin("first", { onQueueItemRemoved: first }))
    seedRoomPlugin(registry, "room1", stubPlugin("second", { onQueueItemRemoved: second }))

    const item = createQueueItem()
    await registry.notifyQueueItemRemoved({ roomId: "room1", item, remainingQueue: [] })

    expect(first).toHaveBeenCalledWith({ roomId: "room1", item, remainingQueue: [] })
    expect(second).toHaveBeenCalledWith({ roomId: "room1", item, remainingQueue: [] })
  })

  it("fail-opens when a plugin throws", async () => {
    const registry = new PluginRegistry({} as never, {} as never)
    const second = vi.fn(async () => undefined)
    seedRoomPlugin(
      registry,
      "room1",
      stubPlugin("first", {
        onQueueItemRemoved: async () => {
          throw new Error("boom")
        },
      }),
    )
    seedRoomPlugin(registry, "room1", stubPlugin("second", { onQueueItemRemoved: second }))

    await expect(
      registry.notifyQueueItemRemoved({
        roomId: "room1",
        item: createQueueItem(),
        remainingQueue: [],
      }),
    ).resolves.toBeUndefined()
    expect(second).toHaveBeenCalled()
  })
})
