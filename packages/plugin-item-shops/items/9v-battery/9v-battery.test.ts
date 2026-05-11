import { describe, expect, it, vi } from "vitest"
import { userFactory } from "@repo/factories"
import { nineVoltBattery } from "."
import {
  createMockDefinition,
  createMockDeps,
  invokeUse,
  stubRoomUsers,
} from "../shared/testHelpers"

describe("9v-battery", () => {
  it("registers the expected shortId", () => {
    expect(nineVoltBattery.shortId).toBe("9v-battery")
  })

  it("fails when there is nothing to duplicate except the battery", async () => {
    const deps = createMockDeps()
    vi.mocked(deps.context.inventory.getInventory).mockResolvedValue({
      userId: "u1",
      maxSlots: 20,
      items: [
        {
          itemId: "item-batt",
          definitionId: "item-shops:9v-battery",
          sourcePlugin: "item-shops",
          quantity: 1,
          acquiredAt: Date.now(),
        },
      ],
    } as never)
    vi.mocked(deps.context.inventory.getItemDefinition).mockImplementation(async (id: string) => {
      if (id !== "item-shops:9v-battery") return null
      return {
        id,
        shortId: "9v-battery",
        sourcePlugin: "item-shops",
        name: "9v Battery",
        description: "",
        stackable: true,
        maxStack: 3,
        tradeable: true,
        consumable: true,
        coinValue: 25,
      } as never
    })

    const actor = userFactory.build({ userId: "u1" })
    stubRoomUsers(deps, [actor])

    const result = await invokeUse(
      nineVoltBattery,
      deps,
      actor.userId,
      createMockDefinition("9v-battery", { id: "item-shops:9v-battery" }),
    )

    expect(result.success).toBe(false)
    expect(result.consumed).toBe(false)
    expect(result.message).toMatch(/need at least one other item/i)
    expect(deps.context.inventory.giveItem).not.toHaveBeenCalled()
  })

  it("duplicates a random other item and consumes the battery", async () => {
    const deps = createMockDeps()
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0)

    vi.mocked(deps.context.inventory.getInventory).mockResolvedValue({
      userId: "u1",
      maxSlots: 20,
      items: [
        {
          itemId: "item-batt",
          definitionId: "item-shops:9v-battery",
          sourcePlugin: "item-shops",
          quantity: 1,
          acquiredAt: Date.now(),
        },
        {
          itemId: "item-boost",
          definitionId: "item-shops:boost-pedal",
          sourcePlugin: "item-shops",
          quantity: 1,
          acquiredAt: Date.now(),
          metadata: { foo: 1 },
        },
      ],
    } as never)

    vi.mocked(deps.context.inventory.getItemDefinition).mockImplementation(async (id: string) => {
      if (id === "item-shops:9v-battery") {
        return {
          id,
          shortId: "9v-battery",
          sourcePlugin: "item-shops",
          name: "9v Battery",
          description: "",
          stackable: true,
          maxStack: 3,
          tradeable: true,
          consumable: true,
          coinValue: 25,
        } as never
      }
      if (id === "item-shops:boost-pedal") {
        return {
          id,
          shortId: "boost-pedal",
          sourcePlugin: "item-shops",
          name: "Boost Pedal",
          description: "",
          stackable: true,
          maxStack: 3,
          tradeable: true,
          consumable: true,
          coinValue: 10,
        } as never
      }
      return null
    })

    vi.mocked(deps.context.inventory.giveItem).mockResolvedValue({
      itemId: "new-stack",
      definitionId: "item-shops:boost-pedal",
      sourcePlugin: "item-shops",
      quantity: 1,
      acquiredAt: Date.now(),
    } as never)

    const actor = userFactory.build({ userId: "u1", username: "jamie" })
    stubRoomUsers(deps, [actor])

    const result = await invokeUse(
      nineVoltBattery,
      deps,
      actor.userId,
      createMockDefinition("9v-battery", { id: "item-shops:9v-battery" }),
    )

    randomSpy.mockRestore()

    expect(result.success).toBe(true)
    expect(result.consumed).toBe(true)
    expect(result.message).toMatch(/Boost Pedal/)

    expect(deps.context.inventory.giveItem).toHaveBeenCalledWith(
      "u1",
      "item-shops:boost-pedal",
      1,
      { foo: 1 },
      "plugin",
    )
    expect(deps.context.api.sendSystemMessage).toHaveBeenCalledWith(
      "room-1",
      expect.stringMatching(/jamie used a 9v Battery and duplicated Boost Pedal/),
    )
  })

  it("fails when the inventory cannot accept another item", async () => {
    const deps = createMockDeps()
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0)

    vi.mocked(deps.context.inventory.getInventory).mockResolvedValue({
      userId: "u1",
      maxSlots: 20,
      items: [
        {
          itemId: "item-batt",
          definitionId: "item-shops:9v-battery",
          sourcePlugin: "item-shops",
          quantity: 1,
          acquiredAt: Date.now(),
        },
        {
          itemId: "item-boost",
          definitionId: "item-shops:boost-pedal",
          sourcePlugin: "item-shops",
          quantity: 1,
          acquiredAt: Date.now(),
        },
      ],
    } as never)

    vi.mocked(deps.context.inventory.getItemDefinition).mockImplementation(async (id: string) => {
      if (id === "item-shops:9v-battery") {
        return { id, shortId: "9v-battery", sourcePlugin: "item-shops", name: "9v Battery" } as never
      }
      if (id === "item-shops:boost-pedal") {
        return { id, shortId: "boost-pedal", sourcePlugin: "item-shops", name: "Boost Pedal" } as never
      }
      return null
    })

    vi.mocked(deps.context.inventory.giveItem).mockResolvedValue(null)

    const actor = userFactory.build({ userId: "u1" })
    stubRoomUsers(deps, [actor])

    const result = await invokeUse(
      nineVoltBattery,
      deps,
      actor.userId,
      createMockDefinition("9v-battery", { id: "item-shops:9v-battery" }),
    )

    randomSpy.mockRestore()

    expect(result.success).toBe(false)
    expect(result.consumed).toBe(false)
    expect(result.message).toMatch(/full/i)
  })
})
