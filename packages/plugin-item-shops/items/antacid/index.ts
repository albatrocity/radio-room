import type { GameStateModifier, ItemDefinition, ItemUseResult } from "@repo/types"
import {
  resolveItemUseActorDisplayName,
  sendAttributedSystemMessage,
} from "../shared/resolveItemUseActorDisplayName"
import { createItem, type ItemShopsBehaviorDeps } from "../shared/types"

function isNegative(modifier: GameStateModifier, now: number): boolean {
  return (
    modifier.startAt <= now &&
    modifier.endAt > now &&
    modifier.effects.some((effect) => effect.intent === "negative")
  )
}

export const antacid = createItem({
  shortId: "antacid",
  definition: {
    name: "Antacid",
    description: "Settles your stomach. Removes your newest negative effect.",
    stackable: true,
    maxStack: 3,
    tradeable: true,
    consumable: true,
    requiresTarget: "self",
    coinValue: 10,
    icon: "Pill",
    rarity: "common",
  },
  use: async (
    deps: ItemShopsBehaviorDeps,
    userId: string,
    definition: ItemDefinition,
  ): Promise<ItemUseResult> => {
    const { game } = deps
    const now = Date.now()
    const state = await game.getUserState(userId)
    const newest = (state?.modifiers ?? [])
      .filter((modifier) => isNegative(modifier, now))
      .sort((a, b) => b.startAt - a.startAt)[0]
    if (!newest) {
      return {
        success: false,
        consumed: false,
        message: "Your stomach is fine. Nothing to settle.",
      }
    }
    await game.removeModifier(userId, newest.id)
    const actor = await resolveItemUseActorDisplayName(deps, userId)
    await sendAttributedSystemMessage(
      deps,
      `${actor.label} took an ${definition.name} and feels a little better.`,
      actor,
      actor,
    )
    return {
      success: true,
      consumed: true,
      message: "Settled. Your newest negative effect is gone.",
    }
  },
})
