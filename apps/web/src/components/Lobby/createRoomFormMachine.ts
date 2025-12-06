import { assign, setup } from "xstate"
import { RoomSetup } from "../../types/Room"

export type Event =
  | { type: "SELECT_TYPE"; data: { type: RoomSetup["type"] } }
  | { type: "SET_SETTINGS"; data: { settings: Partial<RoomSetup> } }
  | { type: "NEXT"; data: null }
  | { type: "BACK"; data: null }

export const createRoomFormMachine = setup({
  types: {
    context: {} as RoomSetup,
    events: {} as Event,
  },
  actions: {
    assignType: assign({
      type: ({ context, event }) => {
        if (event.type === "SELECT_TYPE") {
          return event.data?.type || context.type
        }
        return context.type
      },
    }),
    assignSettings: assign(({ context, event }) => {
      if (event.type === "SET_SETTINGS") {
        return {
          ...context,
          ...event.data?.settings,
        }
      }
      return context
    }),
    storeRoomSettings: ({ context }) => {
      sessionStorage.setItem("createRoomTitle", context.title)
      sessionStorage.setItem("createRoomType", context.type)
      sessionStorage.setItem("createRoomDeputizeOnJoin", context.deputizeOnJoin.toString())
      if (context.type === "radio") {
        sessionStorage.setItem("createRoomRadioProtocol", context.radioProtocol ?? "shoutcastv2")
        if (context.radioMetaUrl) {
          sessionStorage.setItem("createRoomradioMetaUrl", context.radioMetaUrl)
        }
        if (context.radioListenUrl) {
          sessionStorage.setItem("createRoomRadioListenUrl", context.radioListenUrl)
        }
      }
    },
    redirectToLogin: ({ event }) => {
      if (event.type === "NEXT") {
        // Store redirect path for after OAuth completes
        sessionStorage.setItem("postSpotifyAuthRedirect", "/rooms/create")

        // Redirect to Spotify OAuth flow
        window.location.href = `${import.meta.env.VITE_API_URL}/auth/spotify/login?redirect=/callback`
      }
    },
  },
}).createMachine({
  id: "createRoomForm",
  initial: "selectType",
  context: {
    type: "jukebox",
    title: "My Room",
    radioMetaUrl: undefined,
    radioListenUrl: undefined,
    radioProtocol: undefined,
    deputizeOnJoin: true,
  },
  states: {
    selectType: {
      on: {
        SELECT_TYPE: {
          actions: ["assignType"],
        },
        NEXT: "settings",
      },
    },
    settings: {
      on: {
        BACK: "selectType",
        NEXT: {
          actions: ["storeRoomSettings", "redirectToLogin"],
          target: "creating",
        },
        SET_SETTINGS: {
          actions: ["assignSettings"],
        },
      },
    },
    creating: {
      type: "final",
    },
  },
})
