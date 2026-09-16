import { describe, expect, test, vi } from "vitest"
import { userFactory } from "@repo/factories"
import {
  TOUR_LAMINATE_PUNCH_COUNT_KEY,
  TOUR_LAMINATE_PUNCHES_KEY,
} from "@repo/types"
import { accrueTourLaminatePunch, tourLaminate } from "./index"
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
