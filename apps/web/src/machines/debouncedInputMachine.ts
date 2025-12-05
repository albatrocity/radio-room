import { setup, assign, raise } from "xstate"

interface Context {
  value: string | undefined | null
  searchValue: string | undefined | null
}

type DebouncedInputEvent =
  | { type: "SET_VALUE"; value: string }
  | { type: "SET_SEARCH"; value: string }

export const debounceInputMachine = setup({
  types: {
    context: {} as Context,
    events: {} as DebouncedInputEvent,
  },
  actions: {
    setValue: assign({
      value: ({ event }) => {
        if (event.type === "SET_VALUE") {
          return event.value
        }
        return undefined
      },
    }),
    setSearchValue: assign({
      searchValue: ({ event }) => {
        if (event.type === "SET_SEARCH") {
          return event.value
        }
        return undefined
      },
    }),
  },
}).createMachine({
  id: "search",
  initial: "idle",
  context: {
    value: undefined,
    searchValue: undefined,
  },
  states: {
    idle: {
      on: {
        SET_VALUE: {
          target: "typing",
          actions: ["setValue"],
        },
      },
    },
    typing: {
      on: {
        SET_SEARCH: {
          target: "idle",
          actions: ["setSearchValue"],
        },
        SET_VALUE: {
          target: "typing",
          actions: ["setValue"],
          reenter: true,
        },
      },
      after: {
        450: {
          target: "idle",
          actions: [
            assign({
              searchValue: ({ context }) => context.value,
            }),
          ],
        },
      },
    },
  },
})
