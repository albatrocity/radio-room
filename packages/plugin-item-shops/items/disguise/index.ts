import { ANONYMOUS_ACTIONS_FLAG, PRESENTED_IDENTITY_ANONYMOUS_LABEL } from "@repo/plugin-base"
import type { ItemDefinition, ItemUseResult } from "@repo/types"
import { createItem } from "../shared/types"
import type { ItemShopsBehaviorDeps } from "../shared/types"
import {
  sendAttributedSystemMessage,
  resolveItemUseActorDisplayName,
} from "../shared/resolveItemUseActorDisplayName"

const FIVE_MIN_MS = 5 * 60 * 1000

async function useDisguise(
  deps: ItemShopsBehaviorDeps,
  userId: string,
  definition: ItemDefinition,
): Promise<ItemUseResult> {
  const { context, game } = deps

  const applied = await game.applyTimedModifier(
    userId,
    FIVE_MIN_MS,
    {
      name: "disguise",
      effects: [
        {
          type: "flag",
          name: ANONYMOUS_ACTIONS_FLAG,
          value: true,
          intent: "neutral",
          durationMs: FIVE_MIN_MS,
        },
      ],
      stackBehavior: "stack",
      itemDefinitionId: definition.id,
      visibility: "self",
    },
    userId,
  )

  if (!applied.ok) {
    if (applied.reason === "defense_blocked") {
      return {
        success: false,
        consumed: true,
        title: "Intercepted",
        message:
          applied.attackerMessage ??
          `Blocked by ${applied.blockingItemName}. Your item was lost with use.`,
      }
    }
    return { success: false, consumed: false, message: "Could not apply effect." }
  }

  await game.grantPresentedIdentity({
    userId,
    label: PRESENTED_IDENTITY_ANONYMOUS_LABEL,
    chromeLabel: "Disguise",
    icon: "HatGlasses",
    toggleable: true,
    engaged: true,
    durationMs: FIVE_MIN_MS,
    source: "item-shops:disguise",
    // Bind the grant to this modifier so core clears it when the timer ends
    // or the modifier is removed, without knowing this item exists (ADR 0150).
    modifierId: applied.modifierId,
  })

  const actorName = await resolveItemUseActorDisplayName(deps, userId)
  await sendAttributedSystemMessage(
    deps,
    `${actorName.label} put on a disguise and became unrecognizable. (${definition.name} — 5 min).`,
    actorName,
  )

  return {
    success: true,
    consumed: true,
    message: "You donned a disguise. You hardly recognize yourself! It was lost with use.",
  }
}

export const disguise = createItem({
  shortId: "disguise",
  definition: {
    name: "Disguise",
    description:
      "Somebody left behind a strange costume. Wearing it, you look like an entirely different person. Toggle your identity above chat for 5 minutes.",
    stackable: true,
    maxStack: 3,
    tradeable: true,
    consumable: true,
    requiresTarget: "self",
    coinValue: 20,
    icon: "HatGlasses",
    rarity: "uncommon",
  },
  use: useDisguise,
})
