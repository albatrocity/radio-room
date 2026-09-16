import type { InventoryItem } from "@repo/types"
import { TOUR_LAMINATE_PUNCH_COUNT_KEY, TOUR_LAMINATE_PUNCHES_KEY } from "@repo/types"
import { planTourPunch, readTourPunchCount, readTourPunches } from "@repo/game-logic"
import {
  resolveItemUseActorDisplayName,
  sendAttributedSystemMessage,
} from "../shared/resolveItemUseActorDisplayName"
import { createItem, type ItemShopsBehaviorDeps } from "../shared/types"

export const TOUR_LAMINATE_SHORT_ID = "tour-laminate"

function punchRoomLine(username: string, punchNumber: number, coins: number): string {
  if (punchNumber === 1) {
    return `${username}'s Tour Laminate got its first show. +${coins} coins.`
  }
  if (punchNumber === 4) {
    return `${username}'s Tour Laminate picked up show #${punchNumber}. A truly committed fan. +${coins} coins.`
  }
  if (punchNumber === 5) {
    return `${username}'s Tour Laminate picked up show #${punchNumber}. Entering fanatic territory. +${coins} coins.`
  }
  if (punchNumber >= 6) {
    return `${username}'s Tour Laminate is a veteran pass. Punch ${punchNumber}. +${coins} coins.`
  }
  return `${username}'s Tour Laminate picked up show #${punchNumber}. +${coins} coins.`
}

/** Accrue a punch on acquisition. Idempotent per show/session on this copy. */
export async function accrueTourLaminatePunch(
  deps: ItemShopsBehaviorDeps,
  userId: string,
  item: InventoryItem,
): Promise<void> {
  const room = await deps.context.getRoom()
  const session = await deps.game.getActiveSession()
  const [holder] = await deps.context.api.getUsersByIds([userId])
  const holderUsername = holder?.username?.trim() || undefined

  const planned = planTourPunch({
    existing: readTourPunches(item),
    existingCount: readTourPunchCount(item),
    showId: room?.showId,
    sessionId: session?.id,
    at: Date.now(),
    label: room?.title,
    holderUserId: userId,
    holderUsername,
  })
  if (!planned) return

  await deps.context.inventory.updateItemMetadata(userId, item.itemId, {
    [TOUR_LAMINATE_PUNCHES_KEY]: planned.nextHistory,
    [TOUR_LAMINATE_PUNCH_COUNT_KEY]: planned.nextCount,
  })
  await deps.game.addScore(userId, "coin", planned.coins, "tour-laminate:punch")

  const displayName = await resolveItemUseActorDisplayName(deps, userId)
  await sendAttributedSystemMessage(
    deps,
    punchRoomLine(displayName.label, planned.nextCount, planned.coins),
    displayName,
  )
}

export const tourLaminate = createItem({
  shortId: TOUR_LAMINATE_SHORT_ID,
  definition: {
    name: "Tour Laminate",
    description:
      "Worn around your neck. A list of shows you've attended. You might want store this somewhere safe for the next show...",
    stackable: false,
    maxStack: 1,
    tradeable: true,
    consumable: false,
    coinValue: 100,
    icon: "IdCard",
    rarity: "legendary",
    detailView: {
      layout: "punchCard",
      countNoun: { singular: "show", plural: "shows" },
    },
  },
})
