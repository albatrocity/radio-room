import { describe, expect, test, vi } from "vitest"
import { userFactory } from "@repo/factories"
import { buyout } from "./index"
import { createMockDefinition, createMockDeps, invokeUse, stubRoomUsers } from "../shared/testHelpers"

function mockInventory(deps: ReturnType<typeof createMockDeps>, setup: { stacks: Array<{ itemId: string; definitionId: string; quantity: number }>; definitions: Record<string, { coinValue?: number }> }) {
  const inv = { items: setup.stacks.map((s) => ({ ...s, sourcePlugin: "item-shops" })), userId: "u1", maxSlots: 20 }
  vi.mocked(deps.context.inventory.getInventory).mockResolvedValue(inv as never)
  vi.mocked(deps.context.inventory.getItemDefinition).mockImplementation(async (id: string) => {
    const meta = setup.definitions[id]
    if (!meta) return null
    return {
      id,
      shortId: id.split(":").pop() ?? id,
      sourcePlugin: "item-shops",
      name: "Item",
      description: "",
      stackable: true,
      maxStack: 3,
      tradeable: true,
      consumable: true,
      coinValue: meta.coinValue ?? 0,
    } as never
  })
  vi.mocked(deps.context.inventory.removeItem).mockResolvedValue(true)
}

describe("buyout", () => {
  test("fails when user has no other item-shops items", async () => {
    const deps = createMockDeps()
    mockInventory(deps, { stacks: [], definitions: {} })
    const user = userFactory.build({ userId: "u1" })
    stubRoomUsers(deps, [user])

    const result = await invokeUse(
      buyout,
      deps,
      user.userId,
      createMockDefinition("buyout", { id: "item-shops:buyout" }),
    )

    expect(result.success).toBe(false)
    expect(result.consumed).toBe(false)
    expect(result.message).toMatch(/no items to sell/i)
  })

  test("sells all item-shops stacks at 2x coinValue and consumes buyout", async () => {
    const deps = createMockDeps()
    mockInventory(deps, {
      stacks: [
        { itemId: "stack-1", definitionId: "item-shops:compressor-pedal", quantity: 1 },
        { itemId: "stack-2", definitionId: "item-shops:boost-pedal", quantity: 2 },
      ],
      definitions: {
        "item-shops:compressor-pedal": { coinValue: 50 },
        "item-shops:boost-pedal": { coinValue: 50 },
      },
    })
    const user = userFactory.build({ userId: "u1", username: "pat" })
    stubRoomUsers(deps, [user])

    const result = await invokeUse(
      buyout,
      deps,
      user.userId,
      createMockDefinition("buyout", { id: "item-shops:buyout" }),
    )

    expect(result.success).toBe(true)
    expect(result.consumed).toBe(true)
    expect(result.message).toMatch(/Sold 3 item\(s\) for 300 coins/)

    expect(deps.context.inventory.removeItem).toHaveBeenCalledWith("u1", "stack-1", 1)
    expect(deps.context.inventory.removeItem).toHaveBeenCalledWith("u1", "stack-2", 2)
    expect(deps.game.addScore).toHaveBeenCalledWith("u1", "coin", 100, "item-shops:buyout")
    expect(deps.game.addScore).toHaveBeenCalledWith("u1", "coin", 200, "item-shops:buyout")
    expect(deps.context.api.sendSystemMessage).toHaveBeenCalledWith(
      "room-1",
      expect.stringMatching(/pat used Buyout and liquidated 3 item\(s\) for 300 coins/),
    )
  })

  test("resolves bare definitionId when inventory rows omit sourcePlugin", async () => {
    const deps = createMockDeps()
    const inv = {
      items: [{ itemId: "stack-1", definitionId: "compressor-pedal", quantity: 2 }],
      userId: "u1",
      maxSlots: 20,
    }
    vi.mocked(deps.context.inventory.getInventory).mockResolvedValue(inv as never)
    vi.mocked(deps.context.inventory.getItemDefinition).mockImplementation(async (id: string) => {
      if (id !== "item-shops:compressor-pedal") return null
      return {
        id: "item-shops:compressor-pedal",
        shortId: "compressor-pedal",
        sourcePlugin: "item-shops",
        name: "Compressor",
        description: "",
        stackable: true,
        maxStack: 3,
        tradeable: true,
        consumable: true,
        coinValue: 10,
      } as never
    })
    vi.mocked(deps.context.inventory.removeItem).mockResolvedValue(true)

    const user = userFactory.build({ userId: "u1", username: "alex" })
    stubRoomUsers(deps, [user])

    const result = await invokeUse(
      buyout,
      deps,
      user.userId,
      createMockDefinition("buyout", { id: "item-shops:buyout" }),
    )

    expect(result.success).toBe(true)
    expect(result.message).toMatch(/Sold 2 item\(s\) for 40 coins/)
    expect(deps.context.inventory.removeItem).toHaveBeenCalledWith("u1", "stack-1", 2)
    expect(deps.game.addScore).toHaveBeenCalledWith("u1", "coin", 40, "item-shops:buyout")
  })
})
