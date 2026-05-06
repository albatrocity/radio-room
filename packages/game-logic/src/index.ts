export {
  modifierMatchesTargeting,
  queueTargetingMatches,
  effectMatchesTargeting,
} from "./defenseMatching"
export { evaluateModifiers, pruneExpiredModifiers } from "./modifierEvaluation"
export { getActiveFlags } from "./getActiveFlags"
export {
  SHRINK_FLAG,
  GROW_FLAG,
  ECHO_FLAG,
  GATE_FLAG,
  SCRAMBLE_FLAG,
  COMIC_SANS_FLAG,
  countTextEffectStacks,
  type TextEffectStacks,
} from "./textEffectStacks"
export * from "./shoppingSessionCatalog"
