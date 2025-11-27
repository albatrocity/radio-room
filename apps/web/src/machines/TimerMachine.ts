import { createMachine, assign } from "xstate"

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

export const createTimerMachine = ({ duration, start }: CreateTimerMachineProps) =>
  createMachine<ToggleContext, ToggleEvent>({
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
          },
        ],
        initial: "normal",
        states: {
          normal: {
            always: [{ target: "#timer.expired", cond: "timerExpired" }],
            on: {
              RESET: undefined,
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
      expired: {
        on: {
          TOGGLE: undefined,
        },
      },
      paused: {
        on: { TOGGLE: "running" },
      },
    },
    on: {
      RESET: {
        target: ".idle",
      },
    },
  }).withConfig({
    actions: {
      setElapsed: assign({
        elapsed: (ctx) => Date.now() - ctx.start,
      }),
      setRemaining: assign({
        remaining: (ctx) => Math.max(0, ctx.start + ctx.duration - Date.now()),
      }),
    },
    guards: {
      timerExpired: (ctx) => Math.ceil(ctx.remaining / 1000) <= 0,
    },
    services: {
      ticker: (ctx) => (cb) => {
        const interval = setInterval(() => {
          cb("TICK")
        }, ctx.interval * 1000)
        return () => {
          clearInterval(interval)
        }
      },
    },
  })
