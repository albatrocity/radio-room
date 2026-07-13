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
  } as QueueItem
}

function seedRoomPlugin(
  registry: PluginRegistry,
  roomId: string,
  pluginName: string,
  hook: NonNullable<Plugin["beforePlayQueuedTrack"]>,
): void {
  const plugin = {
    name: pluginName,
    version: "1.0.0",
    register: vi.fn(),
    cleanup: vi.fn(),
    beforePlayQueuedTrack: hook,
  } satisfies Plugin

  const roomPlugins = (registry as unknown as { roomPlugins: Map<string, Map<string, unknown>> })
    .roomPlugins
  if (!roomPlugins.has(roomId)) {
    roomPlugins.set(roomId, new Map())
  }
  roomPlugins.get(roomId)!.set(pluginName, {
    plugin,
    lifecycle: new PluginLifecycleImpl(),
  })
}

describe("PluginRegistry.runBeforePlayQueuedTrack", () => {
  it("calls all plugins implementing the hook", async () => {
    const registry = new PluginRegistry({} as never, {} as never)
    const first = vi.fn(async () => undefined)
    const second = vi.fn(async () => undefined)

    seedRoomPlugin(registry, "room1", "first", first)
    seedRoomPlugin(registry, "room1", "second", second)

    const item = createQueueItem()
    await registry.runBeforePlayQueuedTrack({
      roomId: "room1",
      item,
      reason: "manual",
    })

    expect(first).toHaveBeenCalledWith({
      roomId: "room1",
      item,
      reason: "manual",
    })
    expect(second).toHaveBeenCalledWith({
      roomId: "room1",
      item,
      reason: "manual",
    })
  })

  it("fail-opens when a plugin throws", async () => {
    const registry = new PluginRegistry({} as never, {} as never)
    const second = vi.fn(async () => undefined)

    seedRoomPlugin(registry, "room1", "first", async () => {
      throw new Error("boom")
    })
    seedRoomPlugin(registry, "room1", "second", second)

    await expect(
      registry.runBeforePlayQueuedTrack({
        roomId: "room1",
        item: createQueueItem(),
        reason: "auto-advance",
      }),
    ).resolves.toBeUndefined()

    expect(second).toHaveBeenCalled()
  })
})
