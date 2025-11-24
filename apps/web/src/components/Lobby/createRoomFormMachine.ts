import { assign, createMachine } from "xstate"
import { RoomSetup } from "../../types/Room"

export type Event =
  | { type: "SELECT_TYPE"; data: { type: RoomSetup["type"] } }
  | { type: "SET_SETTINGS"; data: { settings: Partial<RoomSetup> } }
  | { type: "NEXT"; data: null }
  | { type: "BACK"; data: null }

export const createRoomFormMachine = createMachine<RoomSetup, Event>(
  {
    predictableActionArguments: true,
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
  },
  {
    guards: {},
    actions: {
      assignType: assign({
        type: (ctx, event) => {
          if (event.type === "SELECT_TYPE") {
            return event.data?.type || ctx.type
          }
          return ctx.type
        },
      }),
      assignSettings: assign((ctx, event) => {
        if (event.type === "SET_SETTINGS") {
          return {
            ...ctx,
            ...event.data?.settings,
          }
        }
        return ctx
      }),
      storeRoomSettings(ctx) {
        sessionStorage.setItem("createRoomTitle", ctx.title)
        sessionStorage.setItem("createRoomType", ctx.type)
        sessionStorage.setItem(
          "createRoomDeputizeOnJoin",
          ctx.deputizeOnJoin.toString(),
        )
        if (ctx.type === "radio") {
          sessionStorage.setItem(
            "createRoomRadioProtocol",
            ctx.radioProtocol ?? "shoutcastv2",
          )
          if (ctx.radioMetaUrl) {
            sessionStorage.setItem("createRoomradioMetaUrl", ctx.radioMetaUrl)
          }
          if (ctx.radioListenUrl) {
            sessionStorage.setItem(
              "createRoomRadioListenUrl",
              ctx.radioListenUrl,
            )
          }
        }
      },
      redirectToLogin: (ctx, event) => {
        if (event.type === "NEXT") {
          // Store redirect path for after OAuth completes
          sessionStorage.setItem("postSpotifyAuthRedirect", "/rooms/create")
          
          // Redirect to Spotify OAuth flow
          window.location.href = `${import.meta.env.VITE_API_URL}/auth/spotify/login?redirect=/callback`
        }
      },
    },
  },
)
