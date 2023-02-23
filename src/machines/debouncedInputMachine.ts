import { createMachine, assign } from "xstate"
import { cancel, send } from "xstate/lib/actions"

interface Context {
  value: string | undefined | null
  searchValue: string | undefined | null
}

export const debounceInputMachine =
  /** @xstate-layout N4IgpgJg5mDOIC5SzAQwE4GMAWA6AlhADZgDEAygKIAqA+gGoCCAMgKqUDaADALqKgAHAPax8AF3xCAdvxAAPRAEYAzF1wA2AKwAObZoCcirl00AWU1wBMAGhABPRJaO4uR05e3quyy8t0Bff1sUDBxcMTsBfCkoChpaKkYAJQBhAAluPiQQYVEJaVkFBBU1LV0DIxNzK1sHYpVcfS5y-R1TVuNTQOC0LDwIqJi4uiY2Tl5ZXPFJGWyiy1bcAHZldX1W5XNtRX1LdVrEbZclrX1lHYNDAO6QKSEIOFkQvsmRaYK5xABafftv9VwFiaJ3UlksmiWZ006huzzChBIrzyM0KiHcBwQYM0uF8pm0YNxK20XSCIDh-Ui0SgSPes1ARR8Sxc2khXF2ylU3n0GN82O26lMO1agvaMMC-iAA */
  createMachine<Context>(
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
