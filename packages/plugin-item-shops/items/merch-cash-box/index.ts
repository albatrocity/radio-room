import type { ItemUseResult } from "@repo/types"
import { resolveItemUseActorDisplayName } from "../shared/resolveItemUseActorDisplayName"
import { createItem } from "../shared/types"

export const merchCashBox = createItem({
  shortId: "merch-cash-box",
  definition: {
    name: "Merch Cash Box",
    description:
      "Lock away coins with a password. Anyone who knows the password can retrieve them from Stored Items.",
    stackable: false,
    maxStack: 1,
    tradeable: true,
    consumable: true,
    requiresTarget: "coinAmount",
    coinValue: 25,
    icon: "PiggyBank",
    rarity: "rare",
  },
  use: async (deps, userId, definition, callContext): Promise<ItemUseResult> => {
    const ctx = callContext as { coinAmount?: number; password?: string } | undefined
    const rawAmount = ctx?.coinAmount
    const coinAmount =
      typeof rawAmount === "number" && Number.isFinite(rawAmount) ? Math.floor(rawAmount) : NaN
    const password = typeof ctx?.password === "string" ? ctx.password : ""

    if (!Number.isFinite(coinAmount) || coinAmount < 1) {
      return { success: false, consumed: false, message: "Enter a positive coin amount to store." }
    }
    if (!password) {
      return { success: false, consumed: false, message: "Enter a password to lock storage." }
    }

    const { context, pluginName, game } = deps
    const state = await game.getUserState(userId)
    const current = state?.attributes?.coin ?? 0
    if (current < coinAmount) {
      return { success: false, consumed: false, message: "You don't have enough coins." }
    }

    await game.addScore(userId, "coin", -coinAmount, `${definition.shortId}:store`)

    try {
      await context.artifacts.store({
        storingPlugin: pluginName,
        storingItemId: definition.shortId,
        artifactType: "coin",
        coinValue: coinAmount,
        storedAt: Date.now(),
        storedByUserId: userId,
        storedByUsername:
          (await context.api.getUsersByIds([userId]).then((u) => u[0]?.username?.trim())) ||
          "Unknown",
        password,
      })
    } catch (e) {
      await game.addScore(userId, "coin", coinAmount, `${definition.shortId}:store-refund`)
      console.error("[merch-cash-box] store failed, refunded coins", e)
      return { success: false, consumed: false, message: "Could not store coins." }
    }

    const displayName = await resolveItemUseActorDisplayName(deps, userId)
    await context.api.sendSystemMessage(
      context.roomId,
      `${displayName} locked ${coinAmount.toLocaleString()} coins in the Merch Cash Box.`,
    )

    return { success: true, consumed: true, message: "Coins stored safely." }
  },
})
