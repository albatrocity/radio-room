import { createMachine, assign, sendTo } from "xstate"
import socketService from "../lib/socketService"

interface Context {
  banner?: string
  enableSpotifyLogin?: boolean
}

export const globalSettingsMachine = createMachine<Context>(
  {
    predictableActionArguments: true,
    id: "globalSettings",
    context: {
      banner: undefined,
      enableSpotifyLogin: false,
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
      FETCH: "loading",
    },
    initial: "active",
    states: {
      loading: {
        entry: ["fetchSettings"],
      },
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
          enableSpotifyLogin: event.data.enableSpotifyLogin,
        }
      }),
      fetchSettings: sendTo("socket", () => ({ type: "get settings" })),
    },
  },
)
