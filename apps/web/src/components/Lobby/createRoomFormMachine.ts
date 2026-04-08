import { assign, setup } from "xstate"
import { DEFAULT_LIVE_HLS_URL, DEFAULT_LIVE_WHEP_URL } from "../../lib/liveStreamDefaults"
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
    assignType: assign(({ context, event }) => {
      if (event.type !== "SELECT_TYPE") return {}
      const nextType = event.data?.type ?? context.type
      if (nextType === "live") {
        return {
          type: "live" as const,
          radioListenUrl: DEFAULT_LIVE_WHEP_URL,
          radioMetaUrl: DEFAULT_LIVE_HLS_URL,
        }
      }
      if (nextType === "jukebox") {
        return {
          type: "jukebox" as const,
          radioListenUrl: undefined,
          radioMetaUrl: undefined,
          radioProtocol: undefined,
        }
      }
      if (nextType === "radio") {
        return {
          type: "radio" as const,
          radioMetaUrl: "http://live.rcast.net:8678",
          radioListenUrl: "https://stream1.rcast.net/66341",
          radioProtocol: "shoutcastv2",
        }
      }
      return { type: nextType }
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
      sessionStorage.setItem("createRoomPublic", (context.public ?? true).toString())
      if (context.showId) {
        sessionStorage.setItem("createRoomShowId", context.showId)
      } else {
        sessionStorage.removeItem("createRoomShowId")
      }
      if (context.type === "radio") {
        sessionStorage.setItem("createRoomRadioProtocol", context.radioProtocol ?? "shoutcastv2")
        if (context.radioMetaUrl) {
          sessionStorage.setItem("createRoomradioMetaUrl", context.radioMetaUrl)
        }
        if (context.radioListenUrl) {
          sessionStorage.setItem("createRoomRadioListenUrl", context.radioListenUrl)
        }
      }
      if (context.type === "live") {
        if (context.radioListenUrl) {
          sessionStorage.setItem("createRoomRadioListenUrl", context.radioListenUrl)
        }
        if (context.radioMetaUrl) {
          sessionStorage.setItem("createRoomradioMetaUrl", context.radioMetaUrl)
        }
      }
    },
    redirectToLogin: ({ event }) => {
      if (event.type === "NEXT") {
        // Store redirect path for after OAuth completes
        sessionStorage.setItem("postSpotifyAuthRedirect", "/rooms/create")

        // Redirect to Spotify OAuth flow
        window.location.href = `${
          import.meta.env.VITE_API_URL
        }/auth/spotify/login?redirect=/callback`
      }
    },
  },
}).createMachine({
  id: "createRoomForm",
  initial: "selectType",
  context: {
    type: "jukebox",
    title: "My Room",
    showId: undefined as string | undefined,
    radioMetaUrl: "http://live.rcast.net:8678",
    radioListenUrl: "https://stream1.rcast.net/66341",
    radioProtocol: "shoutcastv2",
    deputizeOnJoin: true,
    public: true,
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
