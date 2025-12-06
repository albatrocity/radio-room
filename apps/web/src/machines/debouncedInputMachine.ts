import { setup, assign } from "xstate"

interface Context {
  value: string | undefined | null
  searchValue: string | undefined | null
}

type DebouncedInputEvent =
  | { type: "SET_VALUE"; value: string }
  | { type: "SET_SEARCH"; value: string }

/**
 * Creates a debounced input machine with a custom onChange callback.
 * The callback is called after 450ms of no input.
 */
export function createDebouncedInputMachine(onChange: (value: string) => void) {
  return setup({
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
        searchValue: ({ context }) => context.value,
      }),
      onSearchChange: ({ context }) => {
        if (context.value !== undefined && context.value !== null && context.value !== "") {
          onChange(context.value)
        }
      },
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
            actions: ["setSearchValue", "onSearchChange"],
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
            actions: ["setSearchValue", "onSearchChange"],
          },
        },
      },
    },
  })
}

// Keep the old export for backwards compatibility, but it won't have a working callback
export const debounceInputMachine = createDebouncedInputMachine(() => {})
