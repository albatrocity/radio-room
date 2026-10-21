/**
 * Shared road-trip van motion — one actor per plugin trip key per room, so the
 * strip and the Trip tab play the same flourish once. Stopped with the plugin
 * component actors on room teardown.
 */

import { createActor, type ActorRefFrom } from "xstate"
import { roadTripVanMotionMachine } from "../machines/roadTripVanMotionMachine"

export type RoadTripVanMotionActor = ActorRefFrom<typeof roadTripVanMotionMachine>

const actors = new Map<string, RoadTripVanMotionActor>()

export function ensureRoadTripVanMotionActor(
  key: string,
  animationsEnabled: boolean,
): RoadTripVanMotionActor {
  const existing = actors.get(key)
  if (existing) return existing
  const actor = createActor(roadTripVanMotionMachine, { input: { animationsEnabled } }).start()
  actors.set(key, actor)
  return actor
}

export function teardownRoadTripVanMotionActors(): void {
  for (const actor of actors.values()) actor.stop()
  actors.clear()
}
