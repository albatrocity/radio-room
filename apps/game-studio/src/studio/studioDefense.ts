import type {
  DefenseSpec,
  GameStateModifier,
  InventoryItem,
  ItemDefinition,
} from "@repo/types"
import { modifierMatchesTargeting, queueTargetingMatches } from "@repo/game-logic"
import type { StudioRoom } from "./studioRoom"

export interface DefenseBlockInfo {
  itemName: string
  itemId: string
  itemDefinitionId: string
  defenderUserId: string
}

function consumeMatchingDefense(
  room: StudioRoom,
  defenderUserId: string,
  matches: (def: ItemDefinition, spec: DefenseSpec) => boolean,
): DefenseBlockInfo | null {
  const items = [...(room.inventories.get(defenderUserId) ?? [])].sort(
    (a, b) => a.acquiredAt - b.acquiredAt,
  )
  for (const stack of items) {
    if (stack.quantity <= 0) continue
    const def = room.getDefinition(stack.definitionId)
    if (!def?.defense) continue
    if (!matches(def, def.defense)) continue

    const inv = room.inventories.get(defenderUserId) ?? []
    const idx = inv.findIndex((i) => i.itemId === stack.itemId)
    if (idx === -1) continue
    const row = inv[idx]!
    row.quantity -= 1
    if (row.quantity <= 0) {
      inv.splice(idx, 1)
    } else {
      inv[idx] = row
    }
    room.setInventory(defenderUserId, [...inv])

    return {
      itemName: def.name,
      itemId: stack.itemId,
      itemDefinitionId: def.id,
      defenderUserId,
    }
  }
  return null
}

export function checkModifierDefenseStudio(
  room: StudioRoom,
  targetUserId: string,
  sourcePlugin: string,
  incoming: Omit<GameStateModifier, "id" | "source">,
): DefenseBlockInfo | null {
  const modifier: GameStateModifier = {
    ...incoming,
    id: "",
    source: sourcePlugin,
  }
  return consumeMatchingDefense(room, targetUserId, (def, spec) => {
    if (!spec.scope.includes("modifier")) return false
    return modifierMatchesTargeting(modifier, spec.targeting)
  })
}

export function checkQueueDefenseStudio(
  room: StudioRoom,
  queueItemOwnerUserId: string,
  intent: "positive" | "negative",
): DefenseBlockInfo | null {
  if (queueItemOwnerUserId.startsWith("plugin:")) return null
  return consumeMatchingDefense(room, queueItemOwnerUserId, (def, spec) => {
    if (!spec.scope.includes("queue")) return false
    return queueTargetingMatches(spec.targeting, intent)
  })
}
