import { assign, setup } from "xstate"
import { DEFAULT_LIVE_HLS_URL, DEFAULT_LIVE_WHEP_URL } from "../../lib/liveStreamDefaults"
import { RoomSetup } from "../../types/Room"
import { readDevRadioEnvFromVite, resolveRadioRoomDefaults } from "./radioRoomDefaults"

export type Event =
  | { type: "SELECT_TYPE"; data: { type: RoomSetup["type"] } }
  | { type: "SET_SETTINGS"; data: { settings: Partial<RoomSetup> } }
  | { type: "NEXT"; data: null }
  | { type: "BACK"; data: null }

const radioUrlDefaults = resolveRadioRoomDefaults(readDevRadioEnvFromVite())

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
          playbackControllerId: "spotify" as const,
        }
      }
      if (nextType === "jukebox") {
        return {
          type: "jukebox" as const,
          radioListenUrl: undefined,
          radioMetaUrl: undefined,
          radioProtocol: undefined,
          playbackControllerId: undefined,
        }
      }
      if (nextType === "radio") {
        return {
          type: "radio" as const,
          ...radioUrlDefaults,
          playbackControllerId: "spotify" as const,
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
      if (context.type === "radio" || context.type === "live") {
        sessionStorage.setItem(
          "createRoomPlaybackControllerId",
          context.playbackControllerId ?? "spotify",
        )
      } else {
        sessionStorage.removeItem("createRoomPlaybackControllerId")
      }
      if (context.type === "radio") {
        sessionStorage.setItem("createRoomRadioProtocol", context.radioProtocol ?? "shoutcastv2")
        if (context.radioMetaUrl) {
          sessionStorage.setItem("createRoomradioMetaUrl", context.radioMetaUrl)
        }
        if (context.radioListenUrl) {
          sessionStorage.setItem("createRoomRadioListenUrl", context.radioListenUrl)
        }
        sessionStorage.setItem(
          "createRoomLiveIngestEnabled",
          String(context.liveIngestEnabled ?? false),
        )
        if (context.liveWhepUrl) {
          sessionStorage.setItem("createRoomLiveWhepUrl", context.liveWhepUrl)
        } else {
          sessionStorage.removeItem("createRoomLiveWhepUrl")
        }
        if (context.liveHlsUrl) {
          sessionStorage.setItem("createRoomLiveHlsUrl", context.liveHlsUrl)
        } else {
          sessionStorage.removeItem("createRoomLiveHlsUrl")
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
    navigateToCreatePage: ({ event }) => {
      if (event.type === "NEXT") {
        window.location.href = "/rooms/create"
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
    ...radioUrlDefaults,
    liveIngestEnabled: false,
    liveWhepUrl: undefined as string | undefined,
    liveHlsUrl: undefined as string | undefined,
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
          actions: ["storeRoomSettings", "navigateToCreatePage"],
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
