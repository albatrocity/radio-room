import { createMachine, assign, sendTo } from "xstate"
import socketService from "../lib/socketService"

interface Context {
  banner?: string
}

export const globalSettingsMachine = createMachine<Context>(
  {
    predictableActionArguments: true,
    id: "globalSettings",
    context: {
      banner: undefined,
    },
    invoke: [
      {
        id: "socket",
        src: () => socketService,
      },
    ],
    on: {
      SETTINGS: {
        actions: ["setValues"],
      },
    },
    initial: "active",
    states: {
      active: {
        entry: ["fetchSettings"],
      },
    },
  },
  {
    actions: {
      setValues: assign((_context, event) => {
        return {
          banner: event.data.extraInfo,
        }
      }),
      fetchSettings: sendTo("socket", () => ({ type: "get settings" })),
    },
  },
)
