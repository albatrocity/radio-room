/**
 * Shared 1Hz Ticker Actor
 *
 * Singleton actor exposing the current wall-clock timestamp at 1Hz via
 * `context.now`. Use `useNow()` (in `hooks/useActors.ts`) to subscribe.
 *
 * One setInterval, regardless of how many UI elements consume the tick.
 */

import { createActor } from "xstate"
import { sharedTickerMachine } from "../machines/sharedTickerMachine"

export const sharedTickerActor = createActor(sharedTickerMachine).start()

/** Read the latest tick value (snapshot helper for non-React callers). */
export function getNow(): number {
  return sharedTickerActor.getSnapshot().context.now
}
