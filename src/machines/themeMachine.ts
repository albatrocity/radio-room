import { createMachine, assign } from "xstate"
import session from "sessionstorage"
import { AppTheme } from "../types/AppTheme"

interface Context {
  theme: AppTheme["id"]
}

export const themeMachine = createMachine<Context>(
  {
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
        session.setItem("theme", context.theme)
      },
      loadTheme: assign({
        theme: () => session.getItem("theme") || "default",
      }),
    },
  },
)
