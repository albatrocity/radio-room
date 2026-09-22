import type { GameStateModifier, ItemDefinition, ItemUseResult } from "@repo/types"
import {
  sendAttributedSystemMessage,
  resolveItemUseActorDisplayName,
} from "../shared/resolveItemUseActorDisplayName"
import { resolveTargetUser } from "../shared/resolveTargetUser"
import { createItem, type ItemShopsBehaviorDeps } from "../shared/types"

function modifierHasDebuff(modifier: GameStateModifier): boolean {
  return modifier.effects.some((effect) => effect.intent === "negative")
}

export const privateBathroom = createItem({
  shortId: "private-bathroom",
  definition: {
    name: "Private Bathroom",
    description: "Instantly removes all negative effects. Use on yourself or others.",
    stackable: true,
    maxStack: 3,
    tradeable: true,
    consumable: true,
    requiresTarget: "user",
    coinValue: 25,
    icon: "Bath",
    rarity: "uncommon",
  },
  use: async (
    deps: ItemShopsBehaviorDeps,
    userId: string,
    definition: ItemDefinition,
    callContext?: unknown,
  ): Promise<ItemUseResult> => {
    const { context, game } = deps
    const targetUserId =
      (callContext as { targetUserId?: string } | undefined)?.targetUserId ?? userId

    const resolved = await resolveTargetUser(context, userId, { targetUserId })
    if (!resolved.ok) return resolved.result

    const state = await game.getUserState(resolved.targetUserId)
    const debuffModifiers = (state?.modifiers ?? []).filter(modifierHasDebuff)

    if (debuffModifiers.length === 0) {
      return {
        success: false,
        consumed: false,
        message: "No negative effects to clear on that user.",
      }
    }

    for (const modifier of debuffModifiers) {
      await game.removeModifier(resolved.targetUserId, modifier.id)
    }

    const actorName = await resolveItemUseActorDisplayName(deps, userId)
    const targetName = await resolveItemUseActorDisplayName(deps, resolved.targetUserId)
    const isSelf = resolved.targetUserId === userId
    const message = isSelf
      ? `${actorName.label} escaped to the oasis of a ${definition.name} to clear all negative effects.`
      : `${actorName.label} directed ${targetName.label} to the ${definition.name} so they could clear all negative effects.`

    await sendAttributedSystemMessage(deps, message, actorName, targetName)

    return {
      success: true,
      consumed: true,
      message: "Negative effects cleared!",
    }
  },
})
