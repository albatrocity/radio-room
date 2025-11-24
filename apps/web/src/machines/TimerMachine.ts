import { createMachine } from "xstate"

const timerMachine = createMachine({
  id: "timer",
  initial: "active",
  states: {
    active: {
      after: {
        60000: { target: "finished" },
      },
    },
    finished: { type: "final" },
  },
})

export default timerMachine
