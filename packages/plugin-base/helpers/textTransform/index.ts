export {
  SHRINK_FLAG,
  GROW_FLAG,
  ECHO_FLAG,
  GATE_FLAG,
  countTextEffectStacks,
  type TextEffectStacks,
} from "./flags"
export {
  netSizeShift,
  resolveBaseSize,
  resolveEchoSize,
  echoCount,
  applyGateTransform,
} from "./effects"
export { applyTextEffects, type AppliedTextEffects } from "./pipeline"
