import { assign, enqueueActions, setup } from "xstate"
import type { VanPhase } from "../components/PluginComponents/templates/roadTrip/tripView"

export type VanFlourish = "depart" | "park" | "hold"

export const VAN_FLOURISH_MS: Record<VanFlourish, number> = {
  depart: 700,
  park: 700,
  hold: 420,
}

export interface RoadTripVanMotionContext {
  animationsEnabled: boolean
  flourish: VanFlourish | null
  /** Bumped per flourish so the icon replays even when the same one repeats. */
  flourishId: number
}

export type RoadTripVanMotionEvent =
  | { type: "SYNC"; phase: VanPhase }
  | { type: "SET_ANIMATIONS_ENABLED"; enabled: boolean }
  | { type: "FLOURISH_STARTED" }

const PHASES: VanPhase[] = ["ready", "cruising", "exiting", "parked", "held", "arrived", "ended"]

const isRolling = (phase: VanPhase) => phase === "cruising" || phase === "exiting"

export function flourishFor(from: VanPhase, to: VanPhase): VanFlourish | null {
  if (isRolling(to) && (from === "ready" || from === "parked" || from === "held")) return "depart"
  if (isRolling(from) && to === "parked") return "park"
  if (isRolling(from) && to === "held") return "hold"
  return null
}

/** Phase transitions only; the trip store decides the phase, this decides how the van reacts. */
function syncTransitions(from: VanPhase | null) {
  return PHASES.filter((to) => to !== from).map((to) => {
    const flourish = from ? flourishFor(from, to) : null
    return {
      guard: { type: "isPhase" as const, params: { phase: to } },
      target: to,
      ...(flourish ? { actions: { type: "startFlourish" as const, params: { flourish } } } : {}),
    }
  })
}

export const roadTripVanMotionMachine = setup({
  types: {
    context: {} as RoadTripVanMotionContext,
    events: {} as RoadTripVanMotionEvent,
    input: {} as { animationsEnabled: boolean },
  },
  guards: {
    isPhase: ({ event }, params: { phase: VanPhase }) =>
      event.type === "SYNC" && event.phase === params.phase,
  },
  actions: {
    startFlourish: enqueueActions(
      ({ context, enqueue }, params: { flourish: VanFlourish }) => {
        if (!context.animationsEnabled) return
        enqueue.assign({ flourish: params.flourish, flourishId: context.flourishId + 1 })
        enqueue.raise({ type: "FLOURISH_STARTED" })
      },
    ),
    clearFlourish: assign({ flourish: null }),
    setAnimationsEnabled: assign({
      animationsEnabled: ({ event }) =>
        event.type === "SET_ANIMATIONS_ENABLED" ? event.enabled : true,
    }),
  },
  delays: {
    flourishMs: ({ context }) => (context.flourish ? VAN_FLOURISH_MS[context.flourish] : 0),
  },
}).createMachine({
  id: "roadTripVanMotion",
  type: "parallel",
  context: ({ input }) => ({
    animationsEnabled: input.animationsEnabled,
    flourish: null,
    flourishId: 0,
  }),
  on: {
    SET_ANIMATIONS_ENABLED: { actions: "setAnimationsEnabled" },
  },
  states: {
    phase: {
      initial: "unsynced",
      states: {
        // The first SYNC snaps: opening a view never replays a stop that already happened.
        unsynced: { on: { SYNC: syncTransitions(null) } },
        ...Object.fromEntries(
          PHASES.map((phase) => [
            phase,
            {
              on: { SYNC: syncTransitions(phase) },
            },
          ]),
        ),
      },
    },
    flourish: {
      initial: "idle",
      states: {
        idle: { on: { FLOURISH_STARTED: "playing" } },
        playing: {
          on: { FLOURISH_STARTED: { target: "playing", reenter: true } },
          after: { flourishMs: { target: "idle", actions: "clearFlourish" } },
        },
      },
    },
  },
})
