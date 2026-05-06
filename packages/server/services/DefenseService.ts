import type { AppContext } from "@repo/types"
import type {
  DefenseSpec,
  DefenseTargeting,
  GameStateEffectWithMeta,
  GameStateModifier,
  ItemDefinition,
} from "@repo/types"
import { InventoryService } from "./InventoryService"
import { GameSessionService } from "./GameSessionService"

/** Returned when a defense item is consumed to block an action. */
export interface DefenseBlockInfo {
  itemName: string
  itemId: string
  itemDefinitionId: string
  defenderUserId: string
}

/**
 * Passive defense: scan inventory for `ItemDefinition.defense` and consume
 * one quantity from the first matching stack (by `acquiredAt`).
 */
export class DefenseService {
  constructor(private readonly context: AppContext) {}

  private get inventory(): InventoryService | null {
    return (this.context.inventory as InventoryService | undefined) ?? null
  }

  private get gameSessions(): GameSessionService | null {
    return (this.context.gameSessions as GameSessionService | undefined) ?? null
  }

  /**
   * If `targetUserId` has a defense item that blocks this modifier, consume
   * one from the stack and return block info.
   */
  async checkModifierDefense(
    roomId: string,
    targetUserId: string,
    sourcePlugin: string,
    incoming: Omit<GameStateModifier, "id" | "source">,
  ): Promise<DefenseBlockInfo | null> {
    const modifier: GameStateModifier = {
      ...incoming,
      id: "",
      source: sourcePlugin,
    }
    return this.consumeMatchingDefense(roomId, targetUserId, (def, spec) => {
      if (!spec.scope.includes("modifier")) return false
      return modifierMatchesTargeting(modifier, spec.targeting)
    })
  }

  /**
   * If the queue track owner has a defense item blocking this queue intent,
   * consume one and return block info. Skips plugin-attributed queue rows.
   */
  async checkQueueDefense(
    roomId: string,
    queueItemOwnerUserId: string,
    intent: "positive" | "negative",
  ): Promise<DefenseBlockInfo | null> {
    if (queueItemOwnerUserId.startsWith("plugin:")) return null

    return this.consumeMatchingDefense(roomId, queueItemOwnerUserId, (def, spec) => {
      if (!spec.scope.includes("queue")) return false
      return queueTargetingMatches(spec.targeting, intent)
    })
  }

  private async consumeMatchingDefense(
    roomId: string,
    defenderUserId: string,
    matches: (def: ItemDefinition, spec: DefenseSpec) => boolean,
  ): Promise<DefenseBlockInfo | null> {
    const invSvc = this.inventory
    if (!invSvc) return null

    const inv = await invSvc.getInventory(roomId, defenderUserId)
    const sorted = [...inv.items].sort((a, b) => a.acquiredAt - b.acquiredAt)

    for (const stack of sorted) {
      if (stack.quantity <= 0) continue
      const def = await invSvc.getItemDefinition(roomId, stack.definitionId)
      if (!def?.defense) continue
      if (!matches(def, def.defense)) continue

      const removed = await invSvc.removeItem(roomId, defenderUserId, stack.itemId, 1)
      if (!removed) continue

      return {
        itemName: def.name,
        itemId: stack.itemId,
        itemDefinitionId: def.id,
        defenderUserId,
      }
    }

    return null
  }

  async emitEffectBlocked(params: {
    roomId: string
    sessionId: string
    targetUserId: string
    actorUserId?: string
    blockType: "modifier" | "queue"
    modifier?: GameStateModifier
    queue?: { metadataTrackId: string; delta: number; intent: "positive" | "negative" }
    blockedBy: DefenseBlockInfo
  }): Promise<void> {
    if (!this.context.systemEvents) return
    await this.context.systemEvents.emit(params.roomId, "GAME_EFFECT_BLOCKED", {
      roomId: params.roomId,
      sessionId: params.sessionId,
      targetUserId: params.targetUserId,
      actorUserId: params.actorUserId,
      blockType: params.blockType,
      modifier: params.modifier,
      queue: params.queue,
      blockedBy: {
        itemDefinitionId: params.blockedBy.itemDefinitionId,
        itemId: params.blockedBy.itemId,
        defenderUserId: params.blockedBy.defenderUserId,
        itemName: params.blockedBy.itemName,
      },
    })
  }

  async getActiveSessionId(roomId: string): Promise<string> {
    const session = await this.gameSessions?.getActiveSession(roomId)
    return session?.id ?? ""
  }
}

function queueTargetingMatches(targeting: DefenseTargeting, intent: "positive" | "negative"): boolean {
  if (targeting.blockAllModifiers) return true
  if (!targeting.intents?.length) return false
  return targeting.intents.includes(intent)
}

export function modifierMatchesTargeting(
  modifier: GameStateModifier,
  targeting: DefenseTargeting,
): boolean {
  if (targeting.blockAllModifiers) return true

  if (targeting.sourcePlugins?.length && !targeting.sourcePlugins.includes(modifier.source)) {
    return false
  }
  if (targeting.sourceItemDefinitionIds?.length) {
    if (
      !modifier.itemDefinitionId ||
      !targeting.sourceItemDefinitionIds.includes(modifier.itemDefinitionId)
    ) {
      return false
    }
  }

  const hasPerEffect =
    (targeting.flagNames?.length ?? 0) > 0 || (targeting.intents?.length ?? 0) > 0

  if (!hasPerEffect) {
    return true
  }

  for (const effect of modifier.effects) {
    if (effectMatchesTargeting(effect, targeting)) return true
  }
  return false
}

function effectMatchesTargeting(
  effect: GameStateEffectWithMeta,
  targeting: DefenseTargeting,
): boolean {
  if (targeting.flagNames?.length) {
    if (effect.type !== "flag") return false
    if (!targeting.flagNames.includes(effect.name)) return false
  }
  if (targeting.intents?.length) {
    if (!effect.intent || !targeting.intents.includes(effect.intent)) return false
  }
  return true
}
