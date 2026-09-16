import { describe, expect, test, vi } from "vitest"
import { userFactory } from "@repo/factories"
import {
  TOUR_LAMINATE_PUNCH_COUNT_KEY,
  TOUR_LAMINATE_PUNCHES_KEY,
} from "@repo/types"
import {
  accrueTourLaminatePunch,
  maybeAccrueTourLaminateOnAcquire,
  TOUR_LAMINATE_DEFINITION_ID,
  TOUR_LAMINATE_SHORT_ID,
  tourLaminate,
} from "./index"
import {
  createMockDefinition,
  createMockDeps,
  createMockInventoryStack,
  stubRoomUsers,
} from "../shared/testHelpers"

describe("tour laminate punch accrual", () => {
  const actorId = "u-tour"
  const def = createMockDefinition(tourLaminate.shortId, {
    name: "Tour Laminate",
    id: "item-shops:tour-laminate",
    stackable: false,
    maxStack: 1,
    consumable: false,
  })

  test("ledger copy uses show/shows", () => {
    expect(tourLaminate.catalogEntry.definition.detailView).toEqual({
      layout: "punchCard",
      countNoun: { singular: "show", plural: "shows" },
    })
  })

  test("punches on acquire, addScore without intent, and no-ops the second call", async () => {
    const deps = createMockDeps()
    const actor = userFactory.build({ userId: actorId, username: "Ross" })
    stubRoomUsers(deps, [actor])
    const item = createMockInventoryStack(def, { itemId: "lam-1" })
    vi.mocked(deps.context.getRoom).mockResolvedValue({
      id: "room-1",
      title: "Game Studio",
      showId: null,
    } as never)
    vi.mocked(deps.game.getActiveSession).mockResolvedValue({ id: "sess-1" } as never)
    vi.mocked(deps.context.inventory.updateItemMetadata).mockResolvedValue(item)

    await accrueTourLaminatePunch(deps, actorId, item)

    expect(deps.context.inventory.updateItemMetadata).toHaveBeenCalledWith(
      actorId,
      "lam-1",
      expect.objectContaining({
        [TOUR_LAMINATE_PUNCH_COUNT_KEY]: 1,
        [TOUR_LAMINATE_PUNCHES_KEY]: [
          expect.objectContaining({
            key: "session:sess-1",
            coins: 5,
            holderUserId: actorId,
            holderUsername: "Ross",
            label: "Game Studio",
          }),
        ],
      }),
    )
    expect(deps.game.addScore).toHaveBeenCalledWith(actorId, "coin", 5, "tour-laminate:punch")
    expect(deps.game.addScore).toHaveBeenCalledTimes(1)

    const punched = createMockInventoryStack(def, {
      itemId: "lam-1",
      metadata: {
        [TOUR_LAMINATE_PUNCH_COUNT_KEY]: 1,
        [TOUR_LAMINATE_PUNCHES_KEY]: [
          {
            key: "session:sess-1",
            sessionId: "sess-1",
            at: Date.now(),
            coins: 5,
            holderUserId: actorId,
            holderUsername: "Ross",
          },
        ],
      },
    })
    await accrueTourLaminatePunch(deps, actorId, punched)
    expect(deps.context.inventory.updateItemMetadata).toHaveBeenCalledTimes(1)
    expect(deps.game.addScore).toHaveBeenCalledTimes(1)
  })
})

describe("maybeAccrueTourLaminateOnAcquire", () => {
  const actorId = "u-tour"
  const laminateDef = createMockDefinition(TOUR_LAMINATE_SHORT_ID, {
    name: "Tour Laminate",
    id: TOUR_LAMINATE_DEFINITION_ID,
    stackable: false,
    maxStack: 1,
    consumable: false,
  })

  function stubPunchReadyDeps() {
    const deps = createMockDeps()
    const actor = userFactory.build({ userId: actorId, username: "Ross" })
    stubRoomUsers(deps, [actor])
    vi.mocked(deps.context.getRoom).mockResolvedValue({
      id: "room-1",
      title: "Game Studio",
      showId: null,
    } as never)
    vi.mocked(deps.game.getActiveSession).mockResolvedValue({ id: "sess-1" } as never)
    return deps
  }

  test("does not call getItemDefinition for a CD / non-laminate stack", async () => {
    const deps = stubPunchReadyDeps()
    vi.mocked(deps.context.inventory.getItemDefinition).mockImplementation(async (id) => {
      throw new Error(`getItemDefinition must not run for non-laminate ${id}`)
    })
    const cdDef = createMockDefinition("scratched-cd", {
      id: "item-shops:scratched-cd",
      name: "Scratched CD",
    })
    const item = createMockInventoryStack(cdDef)

    await expect(maybeAccrueTourLaminateOnAcquire(deps, actorId, item)).resolves.toBeUndefined()
    expect(deps.context.inventory.getItemDefinition).not.toHaveBeenCalled()
    expect(deps.context.inventory.updateItemMetadata).not.toHaveBeenCalled()
    expect(deps.game.addScore).not.toHaveBeenCalled()
  })

  test("accrues for namespaced item-shops:tour-laminate", async () => {
    const deps = stubPunchReadyDeps()
    vi.mocked(deps.context.inventory.getItemDefinition).mockImplementation(async (id) => {
      if (id !== TOUR_LAMINATE_DEFINITION_ID) {
        throw new Error(`unexpected getItemDefinition(${id})`)
      }
      return laminateDef
    })
    const item = createMockInventoryStack(laminateDef, { itemId: "lam-ns" })
    vi.mocked(deps.context.inventory.updateItemMetadata).mockResolvedValue(item)

    await maybeAccrueTourLaminateOnAcquire(deps, actorId, item)

    expect(deps.context.inventory.getItemDefinition).toHaveBeenCalledTimes(1)
    expect(deps.context.inventory.getItemDefinition).toHaveBeenCalledWith(TOUR_LAMINATE_DEFINITION_ID)
    expect(deps.game.addScore).toHaveBeenCalledWith(actorId, "coin", 5, "tour-laminate:punch")
  })

  test("accrues for bare tour-laminate shortId", async () => {
    const deps = stubPunchReadyDeps()
    vi.mocked(deps.context.inventory.getItemDefinition).mockImplementation(async (id) => {
      if (id === TOUR_LAMINATE_DEFINITION_ID) return laminateDef
      if (id === TOUR_LAMINATE_SHORT_ID) return null
      throw new Error(`unexpected getItemDefinition(${id})`)
    })
    const item = createMockInventoryStack(laminateDef, {
      itemId: "lam-bare",
      definitionId: TOUR_LAMINATE_SHORT_ID,
    })
    vi.mocked(deps.context.inventory.updateItemMetadata).mockResolvedValue(item)

    await maybeAccrueTourLaminateOnAcquire(deps, actorId, item)

    expect(deps.context.inventory.getItemDefinition).toHaveBeenCalledWith(TOUR_LAMINATE_SHORT_ID)
    expect(deps.context.inventory.getItemDefinition).toHaveBeenCalledWith(TOUR_LAMINATE_DEFINITION_ID)
    expect(deps.game.addScore).toHaveBeenCalledWith(actorId, "coin", 5, "tour-laminate:punch")
  })
})
