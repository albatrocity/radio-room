import type { ItemDefinition, ItemUseResult } from "@repo/types"
import { resolveItemUseActorDisplayName } from "../shared/resolveItemUseActorDisplayName"
import { createItem, type ItemShopsBehaviorDeps } from "../shared/types"

/** +1 coin per full minute held, on top of catalog `coinValue`. */
const MAX_APPRECIATION_COINS = 500

function computePayout(definition: ItemDefinition, acquiredAt: number, nowMs: number): number {
  const base = Math.max(0, Math.floor(Number(definition.coinValue ?? 0)))
  const heldMs = Math.max(0, nowMs - acquiredAt)
  const appreciation = Math.min(MAX_APPRECIATION_COINS, Math.floor(heldMs / 60_000))
  return base + appreciation
}

async function useMarsEgg(
  deps: ItemShopsBehaviorDeps,
  userId: string,
  definition: ItemDefinition,
): Promise<ItemUseResult> {
  const { context, game, pluginName, activeInventoryItem } = deps
  const stack = activeInventoryItem
  if (!stack) {
    return { success: false, consumed: false, message: "Could not read this inventory stack." }
  }

  const now = Date.now()
  const payout = computePayout(definition, stack.acquiredAt, now)

  if (payout <= 0) {
    return { success: false, consumed: false, message: "This egg has no value to collect." }
  }

  await game.addScore(userId, "coin", payout, `${pluginName}:mars-egg`)

  const displayName = await resolveItemUseActorDisplayName(deps, userId)
  await context.api.sendSystemMessage(
    context.roomId,
    `${displayName} cracked a Mars Egg and collected ${payout} coins!`,
  )

  const bonus = payout - Math.max(0, Math.floor(Number(definition.coinValue ?? 0)))
  const bonusNote = bonus > 0 ? ` (${bonus} appreciation)` : ""
  return {
    success: true,
    consumed: true,
    message: `Collected ${payout} coins${bonusNote}.`,
  }
}

export const marsEgg = createItem({
  shortId: "mars-egg",
  definition: {
    name: "Mars Egg",
    description: "Appreciates in value the longer you hold. Use from inventory to collect coins.",
    stackable: false,
    maxStack: 1,
    tradeable: false,
    consumable: true,
    coinValue: 50,
    icon: "Egg",
    rarity: "legendary",
  },
  use: useMarsEgg,
})
