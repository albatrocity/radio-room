import type { DefenseTriggeredResult } from "@repo/types"
import { usePassiveDefenseItem } from "../shared/behaviorHelpers"
import { resolveItemUseActorDisplayName } from "../shared/resolveItemUseActorDisplayName"
import {
  createItem,
  type DefenseTriggeredHandler,
  type ItemShopsBehaviorDeps,
} from "../shared/types"

const rubberBandOnDefenseTriggered: DefenseTriggeredHandler = async (
  deps: ItemShopsBehaviorDeps,
  ctx,
): Promise<DefenseTriggeredResult | null> => {
  const {
    defenderUserId,
    attackerUserId,
    attackerItemDefinition,
    defenseItemDefinition,
    blockedModifier,
  } = ctx
  if (!blockedModifier || attackerUserId == null) {
    return null
  }

  const applied = await deps.game.reboundModifier(attackerUserId, blockedModifier, {
    actorUserId: attackerUserId,
  })

  const [roomAttackerName, roomDefenderName] = await Promise.all([
    resolveItemUseActorDisplayName(deps, attackerUserId),
    resolveItemUseActorDisplayName(deps, defenderUserId),
  ])
  const defenseName = defenseItemDefinition.name
  const itemLabel = attackerItemDefinition?.name ?? blockedModifier.name

  if (!applied.ok) {
    const reason = applied.reason === "no_active_session" ? "no active session" : applied.reason
    return {
      attackerMessage: `${defenseName} tried to snap the effect back at you, but it did not apply (${reason}).`,
      roomMessage: `${roomDefenderName}'s ${defenseName} tried to bounce ${roomAttackerName}'s "${itemLabel}" back onto ${roomAttackerName}, but it did not stick.`,
    }
  }

  return {
    attackerMessage: `${defenseName}: the effect hit you instead of ${roomDefenderName}.`,
    roomMessage: `${roomDefenderName}'s ${defenseName} bounced ${roomAttackerName}'s "${itemLabel}" back onto ${roomAttackerName}.`,
  }
}

export const rubberBand = createItem({
  shortId: "rubber-band",
  definition: {
    name: "Rubber Band",
    description:
      "When another player uses an item-shops effect on you, this is spent and the effect applies to them instead.",
    stackable: true,
    maxStack: 3,
    tradeable: true,
    consumable: false,
    coinValue: 28,
    icon: "RotateCcw",
    rarity: "uncommon",
    defense: {
      targeting: {
        sourcePlugins: ["item-shops"],
      },
      scope: ["modifier"],
    },
  },
  use: usePassiveDefenseItem,
  onDefenseTriggered: rubberBandOnDefenseTriggered,
})
