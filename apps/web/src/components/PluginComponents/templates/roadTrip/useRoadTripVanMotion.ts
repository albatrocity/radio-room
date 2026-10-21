import { useEffect } from "react"
import { useSelector } from "@xstate/react"
import { ensureRoadTripVanMotionActor } from "../../../../actors/roadTripVanMotionRegistry"
import { useAnimationsEnabled } from "../../../../hooks/useReducedMotion"
import type { VanFlourish } from "../../../../machines/roadTripVanMotionMachine"
import type { VanPhase } from "./tripView"

export type VanMotion = {
  /** Null until the first sync; fall back to the store's phase. */
  phase: VanPhase | null
  flourish: VanFlourish | null
  flourishId: number
}

/** Shared van motion for this trip; syncs `phase` only when it changes. */
export function useRoadTripVanMotion(key: string, phase: VanPhase | null): VanMotion {
  const animationsEnabled = useAnimationsEnabled()
  const actor = ensureRoadTripVanMotionActor(key, animationsEnabled)

  useEffect(() => {
    actor.send({ type: "SET_ANIMATIONS_ENABLED", enabled: animationsEnabled })
  }, [actor, animationsEnabled])

  useEffect(() => {
    if (phase) actor.send({ type: "SYNC", phase })
  }, [actor, phase])

  const syncedPhase = useSelector(actor, (s) => {
    const value = (s.value as { phase: string }).phase
    return value === "unsynced" ? null : (value as VanPhase)
  })
  const flourish = useSelector(actor, (s) => s.context.flourish)
  const flourishId = useSelector(actor, (s) => s.context.flourishId)
  return { phase: syncedPhase, flourish, flourishId }
}
