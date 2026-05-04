export {
  SHRINK_FLAG,
  GROW_FLAG,
  ECHO_FLAG,
  GATE_FLAG,
  SCRAMBLE_FLAG,
  COMIC_SANS_FLAG,
  countTextEffectStacks,
  type TextEffectStacks,
} from "./flags"
export {
  netSizeShift,
  resolveBaseSize,
  resolveEchoSize,
  echoCount,
  applyGateTransform,
  applyScrambleTransform,
} from "./effects"
export { applyTextEffects, type AppliedTextEffects } from "./pipeline"
