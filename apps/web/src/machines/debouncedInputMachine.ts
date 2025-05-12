import { createMachine, assign } from "xstate"
import { cancel, send } from "xstate/lib/actions"

interface Context {
  value: string | undefined | null
  searchValue: string | undefined | null
}

export const debounceInputMachine = createMachine<Context>(
  {
    predictableActionArguments: true,
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
            actions: ["setSearchValue", "onSearchChange"],
          },
          SET_VALUE: {
            target: ".",
            actions: ["setValue", cancel("debounced-input"), "debounceInput"],
          },
        },
      },
    },
  },
  {
    actions: {
      setValue: assign({
        value: (_context, event) => event.value,
      }),
      setSearchValue: assign({
        searchValue: (_context, event) => {
          return event.value
        },
      }),
      debounceInput: send(
        (_context, event) => ({ type: "SET_SEARCH", value: event.value }),
        {
          delay: 450,
          id: "debounced-input",
        },
      ),
    },
  },
)
