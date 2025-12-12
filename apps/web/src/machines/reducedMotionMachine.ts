import { setup, assign } from "xstate"

interface Context {
  reducedMotion: boolean
}

type ReducedMotionEvent =
  | { type: "SET_REDUCED_MOTION"; value: boolean }
  | { type: "TOGGLE_REDUCED_MOTION" }

const STORAGE_KEY = "reducedMotion"

export const reducedMotionMachine = setup({
  types: {
    context: {} as Context,
    events: {} as ReducedMotionEvent,
  },
  actions: {
    setReducedMotion: assign({
      reducedMotion: ({ event }) => {
        if (event.type === "SET_REDUCED_MOTION") {
          return event.value
        }
        return false
      },
    }),
    toggleReducedMotion: assign({
      reducedMotion: ({ context }) => !context.reducedMotion,
    }),
    persistReducedMotion: ({ context }) => {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(context.reducedMotion))
    },
    loadReducedMotion: assign({
      reducedMotion: () => {
        const stored = sessionStorage.getItem(STORAGE_KEY)
        return stored ? JSON.parse(stored) : false
      },
    }),
  },
}).createMachine({
  id: "reducedMotion",
  context: {
    reducedMotion: false,
  },
  entry: ["loadReducedMotion"],
  on: {
    SET_REDUCED_MOTION: {
      actions: ["setReducedMotion", "persistReducedMotion"],
    },
    TOGGLE_REDUCED_MOTION: {
      actions: ["toggleReducedMotion", "persistReducedMotion"],
    },
  },
})

