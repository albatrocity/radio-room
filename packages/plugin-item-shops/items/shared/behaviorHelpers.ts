import type { GameStateEffectWithMeta, ItemDefinition, ItemUseResult } from "@repo/types"
import { resolveItemUseActorDisplayName } from "./resolveItemUseActorDisplayName"
import type { ItemShopsBehaviorDeps, ItemUseHandler } from "./types"

export type TargetedTimedModifierSpec = {
  modifierName: string
  effects: GameStateEffectWithMeta[]
  successMessage: string
  describe: (p: { isSelf: boolean; actor: string; target: string }) => string
  /** UI visibility scope. Defaults to public (omit). */
  visibility?: "public" | "self"
}

export type ApplyTargetedTimedModifierParams = {
  deps: ItemShopsBehaviorDeps
  userId: string
  callContext: unknown
  definition: ItemDefinition
  spec: TargetedTimedModifierSpec
}

export async function applyTargetedTimedModifier(
  params: ApplyTargetedTimedModifierParams,
): Promise<ItemUseResult> {
  const { deps, userId, callContext, definition, spec } = params
  const { context, game } = deps
  const targetUserId =
    (callContext as { targetUserId?: string } | undefined)?.targetUserId ?? userId
  const roomUsers = await context.api.getUsers(context.roomId)
  if (!roomUsers.some((u) => u.userId === targetUserId)) {
    return { success: false, consumed: false, message: "That user is not in this room." }
  }

  const groups = groupEffectsByResolvedDurationMs(spec.effects, {
    modifierName: spec.modifierName,
  })

  for (const group of groups) {
    const applied = await game.applyTimedModifier(
      targetUserId,
      group.durationMs,
      {
        name: group.modifierName,
        effects: group.effects,
        stackBehavior: "stack",
        itemDefinitionId: definition.id,
        ...(spec.visibility === "self" ? { visibility: "self" as const } : {}),
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
  }

  const actorName = await resolveItemUseActorDisplayName(deps, userId)
  const targetName = await resolveItemUseActorDisplayName(deps, targetUserId)
  const isSelf = targetUserId === userId
  const who = spec.describe({ isSelf, actor: actorName, target: targetName })
  const durationSummary = formatDurationSummary(groups.map((g) => g.durationMs))
  await context.api.sendSystemMessage(
    context.roomId,
    `${who} (${definition.name} — ${durationSummary}).`,
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
  /** One or more modifier effects to apply while active. Each must include `durationMs`. */
  effects: GameStateEffectWithMeta[]
  /** Message shown to the user who activated the item. */
  successMessage: string
  /** Generates the system message describing who is affected. */
  describe: (p: { isSelf: boolean; actor: string; target: string }) => string
  /** UI visibility scope. Defaults to public when omitted. */
  visibility?: "public" | "self"
}

/**
 * Builds a use handler that applies a timed flag-based modifier.
 * Icon defaults to the resolved item definition's `icon` when `icon` is omitted.
 *
 * @example
 * ```ts
 * use: timedModifierEffect({
 *   modifierName: "boost",
 *   effects: [
 *     { type: "flag", name: GROW_FLAG, value: true, intent: "positive", durationMs: 300_000 },
 *   ],
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
      spec: {
        modifierName: config.modifierName,
        effects: config.effects.map((effect) => {
          const resolvedIcon = effect.icon ?? (definition.icon as GameStateEffectWithMeta["icon"])
          return resolvedIcon == null ? effect : { ...effect, icon: resolvedIcon }
        }),
        successMessage: config.successMessage,
        describe: config.describe,
        visibility: config.visibility,
      },
    })
}

type EffectDurationGroup = {
  durationMs: number
  modifierName: string
  effects: GameStateEffectWithMeta[]
}

function stripDurationMs(effect: GameStateEffectWithMeta): GameStateEffectWithMeta {
  if (effect.durationMs === undefined) return effect
  const { durationMs: _omit, ...rest } = effect
  return rest as GameStateEffectWithMeta
}

function groupEffectsByResolvedDurationMs(
  effects: GameStateEffectWithMeta[],
  params: {
    modifierName: string
  },
): EffectDurationGroup[] {
  const buckets = new Map<number, GameStateEffectWithMeta[]>()
  for (const effect of effects) {
    const resolvedMs = effect.durationMs
    if (resolvedMs === undefined) {
      throw new Error(
        `[timedModifierEffect] Each effect must set durationMs for modifier "${params.modifierName}".`,
      )
    }
    if (!Number.isFinite(resolvedMs) || resolvedMs <= 0) {
      throw new Error(
        `[timedModifierEffect] Invalid duration for modifier "${params.modifierName}": ${String(resolvedMs)}`,
      )
    }
    const stripped = stripDurationMs(effect)
    const list = buckets.get(resolvedMs)
    if (list) {
      list.push(stripped)
    } else {
      buckets.set(resolvedMs, [stripped])
    }
  }

  const distinctDurations = Array.from(buckets.keys()).sort((a, b) => b - a)
  const multi = distinctDurations.length > 1

  return distinctDurations.map((durationMs) => ({
    durationMs,
    modifierName: multi ? `${params.modifierName}__${durationMs}` : params.modifierName,
    effects: buckets.get(durationMs) ?? [],
  }))
}

function formatDurationSummary(durationsMs: number[]): string {
  const parts = Array.from(new Set(durationsMs))
    .sort((a, b) => a - b)
    .map(formatSingleDuration)
  return parts.join(" · ")
}

function formatSingleDuration(ms: number): string {
  if (ms < 60_000) {
    const sec = Math.max(1, Math.round(ms / 1000))
    return `${sec}s`
  }
  const min = Math.round(ms / 60_000)
  return `${min} min`
}
