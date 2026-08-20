import { beforeEach, describe, expect, test, vi } from "vitest"
import type { AppContext, GameSession, InventoryItem } from "@repo/types"
import { InventoryService } from "./InventoryService"

const roomId = "room1"
const userId = "user1"

function makeSession(overrides?: Partial<GameSession["config"]>): GameSession {
  return {
    id: "session1",
    roomId,
    config: { maxInventorySlots: 5, maxCollectionSlots: 20, ...overrides },
  } as GameSession
}

function makeService(params?: { session?: GameSession | null; items?: InventoryItem[] }) {
  const hGetAll = vi.fn().mockResolvedValue(
    Object.fromEntries((params?.items ?? []).map((item) => [item.itemId, JSON.stringify(item)])),
  )
  const getActiveSession = vi.fn().mockResolvedValue(params?.session ?? null)

  const context = {
    redis: { pubClient: { hGetAll } },
    gameSessions: params?.session === undefined ? undefined : { getActiveSession },
  } as unknown as AppContext

  return { service: new InventoryService(context), hGetAll, getActiveSession }
}

describe("InventoryService.getInventory", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("resolves both slot caps from a single active-session read", async () => {
    const { service, getActiveSession } = makeService({ session: makeSession() })

    await expect(service.getInventory(roomId, userId)).resolves.toEqual({
      userId,
      items: [],
      maxSlots: 5,
      maxCollectionSlots: 20,
    })
    expect(getActiveSession).toHaveBeenCalledTimes(1)
  })

  test("falls back to defaults when there is no active session", async () => {
    const { service, getActiveSession } = makeService({ session: null })

    const inv = await service.getInventory(roomId, userId)
    expect(inv.maxSlots).toBe(3)
    expect(inv.maxCollectionSlots).toBe(12)
    expect(getActiveSession).toHaveBeenCalledTimes(1)
  })

  test("falls back to defaults per cap when the session omits one", async () => {
    const { service } = makeService({
      session: makeSession({ maxCollectionSlots: undefined }),
    })

    const inv = await service.getInventory(roomId, userId)
    expect(inv.maxSlots).toBe(5)
    expect(inv.maxCollectionSlots).toBe(12)
  })

  test("skips the session read entirely without a game session service", async () => {
    const { service } = makeService()

    const inv = await service.getInventory(roomId, userId)
    expect(inv.maxSlots).toBe(3)
    expect(inv.maxCollectionSlots).toBe(12)
  })

  test("parses stored items and skips malformed entries", async () => {
    const item = {
      itemId: "i1",
      definitionId: "d1",
      sourcePlugin: "item-shops",
      quantity: 1,
      acquiredAt: 1,
    } as InventoryItem
    const { service, hGetAll } = makeService({ session: makeSession(), items: [item] })
    hGetAll.mockResolvedValue({ i1: JSON.stringify(item), bad: "{not json" })

    const inv = await service.getInventory(roomId, userId)
    expect(inv.items).toEqual([item])
  })
})
