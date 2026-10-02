import { describe, it, expect, vi } from "vitest"
import type { Plugin, ShopAccessCapability } from "@repo/types"
import { PluginLifecycleImpl } from "./PluginLifecycle"
import { PluginRegistry } from "./PluginRegistry"

function seedRoomPlugin(registry: PluginRegistry, roomId: string, plugin: Plugin): void {
  const roomPlugins = (registry as unknown as { roomPlugins: Map<string, Map<string, unknown>> })
    .roomPlugins
  if (!roomPlugins.has(roomId)) roomPlugins.set(roomId, new Map())
  roomPlugins.get(roomId)!.set(plugin.name, { plugin, lifecycle: new PluginLifecycleImpl() })
}

function shopsPlugin(shopAccess: ShopAccessCapability): Plugin {
  return {
    name: "item-shops",
    version: "1.0.0",
    register: vi.fn(),
    cleanup: vi.fn(),
    capabilities: { shopAccess },
  }
}

function shopAccessStub(): ShopAccessCapability {
  return {
    openRoomShop: vi.fn(async () => ({ ok: true as const })),
    closeRoomShop: vi.fn(async () => {}),
    validateShop: vi.fn(async () => ({ ok: true as const })),
  }
}

describe("PluginRegistry.requestCapability (ADR 0201)", () => {
  it("routes to the room instance of the declaring plugin", async () => {
    const registry = new PluginRegistry({} as never, {} as never)
    const access = shopAccessStub()
    registry.registerPlugin(() => shopsPlugin(shopAccessStub()))
    seedRoomPlugin(registry, "room1", shopsPlugin(access))

    const request = { scopeId: "trip:t:site:a", shopIds: ["farmers-market"] }
    const result = await registry.requestCapability("room1", "shopAccess", "openRoomShop", [
      request,
    ])

    expect(result).toEqual({ ok: true, value: { ok: true }, provider: "item-shops" })
    expect(access.openRoomShop).toHaveBeenCalledWith(request)
  })

  it("returns unsupported when nothing declares the capability", async () => {
    const registry = new PluginRegistry({} as never, {} as never)
    await expect(
      registry.requestCapability("room1", "shopAccess", "closeRoomShop", ["x"]),
    ).resolves.toEqual({ ok: false, reason: "unsupported" })
  })

  it("returns unsupported for an undeclared method", async () => {
    const registry = new PluginRegistry({} as never, {} as never)
    registry.registerPlugin(() => shopsPlugin(shopAccessStub()))
    seedRoomPlugin(registry, "room1", shopsPlugin(shopAccessStub()))
    await expect(registry.requestCapability("room1", "shopAccess", "steal", [])).resolves.toEqual({
      ok: false,
      reason: "unsupported",
    })
  })

  it("contains provider errors", async () => {
    const registry = new PluginRegistry({} as never, {} as never)
    const access = shopAccessStub()
    access.closeRoomShop = vi.fn(async () => {
      throw new Error("boom")
    })
    registry.registerPlugin(() => shopsPlugin(shopAccessStub()))
    seedRoomPlugin(registry, "room1", shopsPlugin(access))
    await expect(
      registry.requestCapability("room1", "shopAccess", "closeRoomShop", ["x"]),
    ).resolves.toEqual({ ok: false, reason: "error", message: "boom" })
  })
})
