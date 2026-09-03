import type { DefenseTriggeredResult } from "@repo/types"
import { usePassiveDefenseItem } from "../shared/behaviorHelpers"
import { resolveItemUseActorDisplayName } from "../shared/resolveItemUseActorDisplayName"
import {
  createItem,
  type DefenseTriggeredHandler,
  type ItemShopsBehaviorDeps,
} from "../shared/types"

const honeypotOnDefenseTriggered: DefenseTriggeredHandler = async (
  deps: ItemShopsBehaviorDeps,
  ctx,
): Promise<DefenseTriggeredResult | null> => {
  const { defenderUserId, attackerUserId, attackerItemDefinition, defenseItemDefinition } = ctx
  if (!attackerItemDefinition || attackerUserId == null) {
    return null
  }

  const copied = await deps.context.inventory.giveItem(
    defenderUserId,
    attackerItemDefinition.id,
    1,
    undefined,
    "defense_intercept",
  )
  const [roomAttackerName, roomDefenderName] = await Promise.all([
    resolveItemUseActorDisplayName(deps, attackerUserId),
    resolveItemUseActorDisplayName(deps, defenderUserId),
  ])
  const defenseName = defenseItemDefinition.name

  if (!copied) {
    return {
      attackerMessage: `${defenseName} intercepted your item — your ${attackerItemDefinition.name} was lost.`,
      roomMessage: `${roomDefenderName.label}'s ${defenseName} intercepted ${roomAttackerName.label}'s ${attackerItemDefinition.name} (no copy taken — inventory was full).`,
    }
  }
  return {
    attackerMessage: `${defenseName} intercepted your ${attackerItemDefinition.name} — it ended up in their inventory instead.`,
    roomMessage: `${roomDefenderName.label}'s ${defenseName} intercepted ${roomAttackerName.label}'s ${attackerItemDefinition.name} — ${roomDefenderName.label} gained a copy.`,
  }
}

export const honeypot = createItem({
  shortId: "honeypot",
  definition: {
    name: "Honeypot",
    description: "HA HA. STEAL THE NEXT ITEM USED ON YOU, IGNORE ITS EFFECTS AND KEEP IT FOR YOURSELF >:)",
    stackable: true,
    maxStack: 3,
    tradeable: true,
    consumable: false,
    coinValue: 30,
    icon: "Network",
    rarity: "rare",
    defense: {
      targeting: {
        sourcePlugins: ["item-shops"],
      },
      scope: ["modifier"],
    },
  },
  use: usePassiveDefenseItem,
  onDefenseTriggered: honeypotOnDefenseTriggered,
})
