import type {
  DefenseTargeting,
  GameStateEffectWithMeta,
  GameStateModifier,
} from "@repo/types"

export function queueTargetingMatches(
  targeting: DefenseTargeting,
  intent: "positive" | "negative",
): boolean {
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

export function effectMatchesTargeting(
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
