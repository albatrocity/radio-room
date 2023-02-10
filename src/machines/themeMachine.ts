import { Machine, assign } from "xstate"

export const themeMachine = Machine(
  {
    id: "theme",
    context: {
      theme: "watermelon",
    },
    on: {
      SET_THEME: {
        actions: ["setTheme"],
      },
    },
  },
  {
    actions: {
      setTheme: assign({
        theme: (context, event) => event.theme,
      }),
    },
  },
)
