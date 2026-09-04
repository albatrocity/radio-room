import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { PHYSICAL_MEDIA_CONDITION_KEY } from "@repo/types"
import {
  bindPhysicalMediaConditionFx,
  RESTORE_ACQUIRED_WAIT_FOR_DOM_MS,
} from "./physicalMediaConditionFx"

const playInventoryItemAnimation = vi.hoisted(() =>
  vi.fn((_itemId: string, _name: string, _opts?: { waitForDomMs?: number }) => Promise.resolve()),
)
const getCurrentUser = vi.hoisted(() => vi.fn(() => ({ userId: "me" })))
const getUserInventory = vi.hoisted(() => vi.fn(() => ({ items: [] as unknown[] })))

vi.mock("./inventoryItemAnimations", () => ({
  playInventoryItemAnimation: (
    itemId: string,
    name: string,
    opts?: { waitForDomMs?: number },
  ) =>
    opts === undefined
      ? playInventoryItemAnimation(itemId, name)
      : playInventoryItemAnimation(itemId, name, opts),
}))

vi.mock("../actors/authActor", () => ({
  getCurrentUser: () => getCurrentUser(),
}))

vi.mock("../actors/userGameStateActor", () => ({
  getUserInventory: () => getUserInventory(),
}))

vi.mock("../actors/socketActor", () => ({
  subscribeById: vi.fn(),
  unsubscribeById: vi.fn(),
}))

import { subscribeById } from "../actors/socketActor"

const held = {
  itemId: "pm-1",
  definitionId: "item-shops:pm-kid-a",
  sourcePlugin: "item-shops",
  quantity: 1,
  acquiredAt: 1,
  metadata: { [PHYSICAL_MEDIA_CONDITION_KEY]: "mint" },
}

describe("physicalMediaConditionFx", () => {
  let send: (event: { type: string; data?: unknown }) => void

  beforeAll(() => {
    bindPhysicalMediaConditionFx()
    send = vi.mocked(subscribeById).mock.calls[0]![1].send
  })

  beforeEach(() => {
    playInventoryItemAnimation.mockClear()
    getCurrentUser.mockReturnValue({ userId: "me" })
    getUserInventory.mockReturnValue({ items: [held] })
  })

  it("headShakes when an updated copy is more worn", () => {
    send({
      type: "INVENTORY_ITEM_UPDATED",
      data: {
        userId: "me",
        item: {
          ...held,
          metadata: { [PHYSICAL_MEDIA_CONDITION_KEY]: "good" },
        },
      },
    })
    expect(playInventoryItemAnimation).toHaveBeenCalledWith("pm-1", "headShake")
  })

  it("restoreSwells a restore (poor → good)", () => {
    getUserInventory.mockReturnValue({
      items: [{ ...held, metadata: { [PHYSICAL_MEDIA_CONDITION_KEY]: "poor" } }],
    })
    send({
      type: "INVENTORY_ITEM_UPDATED",
      data: {
        userId: "me",
        item: {
          ...held,
          metadata: { [PHYSICAL_MEDIA_CONDITION_KEY]: "good" },
        },
      },
    })
    expect(playInventoryItemAnimation).toHaveBeenCalledWith("pm-1", "restoreSwell")
  })

  it("headShakes a conversion marked degraded", () => {
    send({
      type: "INVENTORY_ITEM_REMOVED",
      data: { userId: "me", itemId: "pm-1", degraded: true },
    })
    expect(playInventoryItemAnimation).toHaveBeenCalledWith("pm-1", "headShake")
  })

  it("does not animate a normal remove", () => {
    send({
      type: "INVENTORY_ITEM_REMOVED",
      data: { userId: "me", itemId: "pm-1" },
    })
    expect(playInventoryItemAnimation).not.toHaveBeenCalled()
  })

  it("restoreSwells an ACQUIRED marked restored", () => {
    send({
      type: "INVENTORY_ITEM_ACQUIRED",
      data: {
        userId: "me",
        restored: true,
        item: { ...held, itemId: "pm-new", metadata: { [PHYSICAL_MEDIA_CONDITION_KEY]: "poor" } },
      },
    })
    expect(playInventoryItemAnimation).toHaveBeenCalledWith("pm-new", "restoreSwell", {
      waitForDomMs: RESTORE_ACQUIRED_WAIT_FOR_DOM_MS,
    })
  })

  it("does not animate an unmarked ACQUIRED", () => {
    send({
      type: "INVENTORY_ITEM_ACQUIRED",
      data: {
        userId: "me",
        item: { ...held, itemId: "pm-buy" },
      },
    })
    expect(playInventoryItemAnimation).not.toHaveBeenCalled()
  })

  it("ignores someone else's inventory events", () => {
    send({
      type: "INVENTORY_ITEM_UPDATED",
      data: {
        userId: "other",
        item: {
          ...held,
          metadata: { [PHYSICAL_MEDIA_CONDITION_KEY]: "good" },
        },
      },
    })
    expect(playInventoryItemAnimation).not.toHaveBeenCalled()
  })
})
