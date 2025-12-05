import { setup, assign } from "xstate"
import { AppTheme } from "../types/AppTheme"

interface Context {
  theme: AppTheme["id"]
}

type ThemeEvent = { type: "SET_THEME"; theme: AppTheme["id"] }

export const themeMachine = setup({
  types: {
    context: {} as Context,
    events: {} as ThemeEvent,
  },
  actions: {
    setTheme: assign({
      theme: ({ event }) => event.theme,
    }),
    persistTheme: ({ context }) => {
      sessionStorage.setItem("theme", context.theme)
    },
    loadTheme: assign({
      theme: () => sessionStorage.getItem("theme") || "default",
    }),
  },
}).createMachine({
  id: "theme",
  context: {
    theme: "default",
  },
  entry: ["loadTheme"],
  on: {
    SET_THEME: {
      actions: ["setTheme", "persistTheme"],
    },
  },
})
