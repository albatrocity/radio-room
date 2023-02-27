import { Machine, assign } from "xstate"
import session from "sessionstorage"

export const themeMachine = Machine(
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
        theme: (context, event) => event.theme,
      }),
      persistTheme: (context) => {
        session.setItem("theme", context.theme)
      },
      loadTheme: assign({
        theme: (context) => session.getItem("theme") || "default",
      }),
    },
  },
)
