import { describe, it, expect, vi } from "vitest"
import type { ChatMessage, Plugin } from "@repo/types"
import { PluginLifecycleImpl } from "./PluginLifecycle"
import { PluginRegistry } from "./PluginRegistry"

function createMessage(content = "guess"): ChatMessage {
  return {
    content,
    timestamp: "2026-01-01T00:00:00.000Z",
    user: { userId: "u1", username: "Alice" },
  }
}

function seedRoomPlugin(
  registry: PluginRegistry,
  roomId: string,
  pluginName: string,
  transform: NonNullable<Plugin["transformChatMessage"]>,
): void {
  const plugin = {
    name: pluginName,
    version: "1.0.0",
    register: vi.fn(),
    cleanup: vi.fn(),
    transformChatMessage: transform,
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

describe("PluginRegistry.transformChatMessage", () => {
  it("returns drop sentinel immediately without calling later plugins", async () => {
    const registry = new PluginRegistry({} as never, {} as never)
    const secondTransform = vi.fn(async () => null)

    seedRoomPlugin(registry, "room1", "first", async () => ({ drop: true, reason: "spoiler" }))
    seedRoomPlugin(registry, "room1", "second", secondTransform)

    const result = await registry.transformChatMessage("room1", createMessage())

    expect(result).toEqual({ drop: true, reason: "spoiler" })
    expect(secondTransform).not.toHaveBeenCalled()
  })

  it("passes transformed message through sequential plugins", async () => {
    const registry = new PluginRegistry({} as never, {} as never)

    seedRoomPlugin(registry, "room1", "first", async (_roomId, message) => ({
      ...message,
      content: `${message.content}-a`,
    }))
    seedRoomPlugin(registry, "room1", "second", async (_roomId, message) => ({
      ...message,
      content: `${message.content}-b`,
    }))

    const result = await registry.transformChatMessage("room1", createMessage("x"))

    expect(result).toEqual(expect.objectContaining({ content: "x-a-b" }))
  })
})
