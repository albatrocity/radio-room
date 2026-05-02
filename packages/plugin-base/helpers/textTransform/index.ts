export {
  SHRINK_FLAG,
  GROW_FLAG,
  ECHO_FLAG,
  countTextEffectStacks,
  type TextEffectStacks,
} from "./flags"
export {
  netSizeShift,
  resolveBaseSize,
  resolveEchoSize,
  echoCount,
} from "./effects"
export { applyTextEffects, type AppliedTextEffects } from "./pipeline"
