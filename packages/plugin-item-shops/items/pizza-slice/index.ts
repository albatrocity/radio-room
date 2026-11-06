import { DOUBLE_VOTE_FLAG, activeFlagModifier } from "@repo/game-logic"
import type { ItemDefinition, ItemUseResult } from "@repo/types"
import {
  resolveItemUseActorDisplayName,
  sendAttributedSystemMessage,
} from "../shared/resolveItemUseActorDisplayName"
import { createItem, type ItemShopsBehaviorDeps } from "../shared/types"

/** The charge waits for the holder's next poll; core removes it when the vote lands. */
const CHARGE_MS = 24 * 60 * 60_000

export const pizzaSlice = createItem({
  shortId: "pizza-slice",
  definition: {
    name: "Pizza Slice",
    description: "Fuel for democracy. Your next poll vote counts twice.",
    stackable: true,
    maxStack: 1,
    tradeable: true,
    consumable: true,
    requiresTarget: "self",
    coinValue: 25,
    icon: "Pizza",
    rarity: "uncommon",
  },
  use: async (
    deps: ItemShopsBehaviorDeps,
    userId: string,
    definition: ItemDefinition,
  ): Promise<ItemUseResult> => {
    const { game } = deps
    const state = await game.getUserState(userId)
    if (activeFlagModifier(state?.modifiers, DOUBLE_VOTE_FLAG, Date.now())) {
      return {
        success: false,
        consumed: false,
        message: "You're still full. Your next vote already counts twice.",
      }
    }
    const applied = await game.applyTimedModifier(
      userId,
      CHARGE_MS,
      {
        name: "pizza-slice",
        effects: [{ type: "flag", name: DOUBLE_VOTE_FLAG, value: true, intent: "positive" }],
        stackBehavior: "replace",
        itemDefinitionId: definition.id,
        icon: "Pizza",
      },
      userId,
    )
    if (!applied.ok) {
      return { success: false, consumed: false, message: "Could not apply effect." }
    }
    const actor = await resolveItemUseActorDisplayName(deps, userId)
    await sendAttributedSystemMessage(
      deps,
      `${actor.label} ate a ${definition.name}. Their next poll vote counts twice.`,
      actor,
      actor,
    )
    return { success: true, consumed: true, message: "Your next poll vote counts twice." }
  },
})
