import type { GameStateEffectWithMeta, ItemDefinition, ItemUseResult } from "@repo/types"
import type { ItemShopsBehaviorDeps, ItemUseHandler } from "./types"

export type TargetedTimedModifierSpec = {
  modifierName: string
  effects: GameStateEffectWithMeta[]
  successMessage: string
  describe: (p: { isSelf: boolean; actor: string; target: string }) => string
}

export type ApplyTargetedTimedModifierParams = {
  deps: ItemShopsBehaviorDeps
  userId: string
  callContext: unknown
  definition: ItemDefinition
  effectDurationMs: number
  spec: TargetedTimedModifierSpec
}

export async function applyTargetedTimedModifier(
  params: ApplyTargetedTimedModifierParams,
): Promise<ItemUseResult> {
  const { deps, userId, callContext, definition, effectDurationMs, spec } = params
  const { context, game } = deps
  const targetUserId =
    (callContext as { targetUserId?: string } | undefined)?.targetUserId ?? userId
  const roomUsers = await context.api.getUsers(context.roomId)
  if (!roomUsers.some((u) => u.userId === targetUserId)) {
    return { success: false, consumed: false, message: "That user is not in this room." }
  }

  const applied = await game.applyTimedModifier(
    targetUserId,
    effectDurationMs,
    {
      name: spec.modifierName,
      effects: spec.effects,
      stackBehavior: "stack",
      itemDefinitionId: definition.id,
    },
    userId,
  )

  if (!applied.ok) {
    if (applied.reason === "defense_blocked") {
      return {
        success: false,
        consumed: true,
        message: `Blocked by ${applied.blockingItemName}. Your item was still lost.`,
      }
    }
    return { success: false, consumed: false, message: "Could not apply effect." }
  }

  const [actor] = await context.api.getUsersByIds([userId])
  const [target] = await context.api.getUsersByIds([targetUserId])
  const actorName = actor?.username?.trim() || userId
  const targetName = target?.username?.trim() || targetUserId
  const isSelf = targetUserId === userId
  const who = spec.describe({ isSelf, actor: actorName, target: targetName })
  await context.api.sendSystemMessage(
    context.roomId,
    `${who} (${definition.name} — ${Math.round(effectDurationMs / 60_000)} min).`,
  )
  return { success: true, consumed: true, message: spec.successMessage }
}

export async function usePassiveDefenseItem(
  _deps: ItemShopsBehaviorDeps,
  _userId: string,
  _definition: ItemDefinition,
): Promise<ItemUseResult> {
  return {
    success: false,
    consumed: true,
    message: "This item protects you automatically — keep it in your inventory.",
  }
}

export type TimedModifierEffectConfig = {
  /** Internal modifier name (e.g. "boost", "compressor"). */
  modifierName: string
  /** The flag constant to apply (e.g. GROW_FLAG, SHRINK_FLAG). */
  flag: string
  /** Icon override. Defaults to the item definition's `icon`. */
  icon?: string
  /** Whether this effect is positive or negative for the target. */
  intent: "positive" | "negative"
  /** Message shown to the user who activated the item. */
  successMessage: string
  /** Generates the system message describing who is affected. */
  describe: (p: { isSelf: boolean; actor: string; target: string }) => string
}

/**
 * Builds a use handler that applies a timed flag-based modifier.
 * Icon defaults to the resolved item definition's `icon` when `icon` is omitted.
 *
 * @example
 * ```ts
 * use: timedModifierEffect({
 *   modifierName: "boost",
 *   flag: GROW_FLAG,
 *   intent: "positive",
 *   successMessage: "Boost engaged. It was lost with use.",
 *   describe: ({ isSelf, actor, target }) =>
 *     isSelf ? `${actor} is boosted` : `${target} is boosted`,
 * })
 * ```
 */
export function timedModifierEffect(config: TimedModifierEffectConfig): ItemUseHandler {
  return (deps, userId, definition, callContext) =>
    applyTargetedTimedModifier({
      deps,
      userId,
      callContext,
      definition,
      effectDurationMs: deps.effectDurationMs,
      spec: {
        modifierName: config.modifierName,
        effects: [
          {
            type: "flag",
            name: config.flag,
            value: true,
            icon: config.icon ?? definition.icon ?? config.modifierName,
            intent: config.intent,
          },
        ],
        successMessage: config.successMessage,
        describe: config.describe,
      },
    })
}
