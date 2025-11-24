import { createMachine, assign } from "xstate"
import { AppTheme } from "../types/AppTheme"

interface Context {
  theme: AppTheme["id"]
}

export const themeMachine = createMachine<Context>(
  {
    predictableActionArguments: true,
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
  },
  {
    actions: {
      setTheme: assign({
        theme: (_context, event) => event.theme,
      }),
      persistTheme: (context) => {
        sessionStorage.setItem("theme", context.theme)
      },
      loadTheme: assign({
        theme: () => sessionStorage.getItem("theme") || "default",
      }),
    },
  },
)
