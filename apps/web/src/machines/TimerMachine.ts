import { setup, assign, fromCallback } from "xstate"

type ToggleEvent = { type: "TOGGLE" } | { type: "RESET" } | { type: "TICK" }

interface ToggleContext {
  duration: number
  elapsed: number
  remaining: number
  interval: number
  start: number
}

interface CreateTimerMachineProps {
  start?: number
  duration: number
}

export const createTimerMachine = ({ duration, start }: CreateTimerMachineProps) => {
  const tickerLogic = fromCallback<ToggleEvent, { interval: number }>(({ sendBack, input }) => {
    const interval = setInterval(() => {
      sendBack({ type: "TICK" })
    }, input.interval * 1000)
    return () => {
      clearInterval(interval)
    }
  })

  return setup({
    types: {
      context: {} as ToggleContext,
      events: {} as ToggleEvent,
    },
    actors: {
      ticker: tickerLogic,
    },
    actions: {
      setElapsed: assign({
        elapsed: ({ context }) => Date.now() - context.start,
      }),
      setRemaining: assign({
        remaining: ({ context }) => Math.max(0, context.start + context.duration - Date.now()),
      }),
    },
    guards: {
      timerExpired: ({ context }) => Math.ceil(context.remaining / 1000) <= 0,
    },
  }).createMachine({
    id: "timer",
    initial: "idle",
    context: {
      duration,
      elapsed: 0,
      remaining: duration,
      interval: 1,
      start: start || Date.now(),
    },

    states: {
      idle: {
        entry: ["setElapsed", "setRemaining"],
        always: [{ target: "running" }],
      },
      running: {
        invoke: [
          {
            id: "ticker",
            src: "ticker",
            input: ({ context }) => ({ interval: context.interval }),
          },
        ],
        initial: "normal",
        states: {
          normal: {
            always: [{ target: "#timer.expired", guard: "timerExpired" }],
            on: {
              TICK: {
                actions: ["setElapsed", "setRemaining"],
              },
            },
          },
        },
        on: {
          TOGGLE: "paused",
        },
      },
      expired: {},
      paused: {
        on: { TOGGLE: "running" },
      },
    },
    on: {
      RESET: {
        target: ".idle",
      },
    },
  })
}
