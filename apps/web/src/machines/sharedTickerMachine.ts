/**
 * Shared 1Hz Ticker Machine
 *
 * A single xstate-managed `setInterval` that exposes the current wall-clock
 * timestamp via `context.now`. Components that need a low-frequency repaint
 * (e.g. draining progress bars) should subscribe via `useNow()` rather than
 * spinning up their own `setInterval`/`setTimeout` or `useEffect`.
 *
 * Reduces N intervals (one per timed UI element) to a single shared one,
 * regardless of how many bars/users/components are mounted.
 */

import { setup, assign, fromCallback } from "xstate"

type SharedTickerEvent = { type: "TICK" }

const tickerLogic = fromCallback<SharedTickerEvent, { intervalMs: number }>(
  ({ sendBack, input }) => {
    const id = setInterval(() => sendBack({ type: "TICK" }), input.intervalMs)
    return () => clearInterval(id)
  },
)

export const sharedTickerMachine = setup({
  types: {
    context: {} as { now: number },
    events: {} as SharedTickerEvent,
  },
  actors: { ticker: tickerLogic },
  actions: {
    setNow: assign({ now: () => Date.now() }),
  },
}).createMachine({
  id: "sharedTicker",
  context: { now: Date.now() },
  invoke: {
    src: "ticker",
    input: { intervalMs: 1000 },
  },
  on: {
    TICK: { actions: "setNow" },
  },
})
