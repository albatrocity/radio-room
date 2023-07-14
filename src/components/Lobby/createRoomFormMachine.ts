import { assign, createMachine } from "xstate"
import { RoomSetupShared } from "../../types/Room"
import { navigate } from "gatsby"

export type Event =
  | { type: "SELECT_TYPE"; data: { type: RoomSetupShared["type"] } }
  | { type: "SET_SETTINGS"; data: { settings: Partial<RoomSetupShared> } }
  | { type: "NEXT"; data: null }
  | { type: "BACK"; data: null }

export const createRoomFormMachine = createMachine<RoomSetupShared, Event>(
  {
    predictableActionArguments: true,
    id: "createRoomForm",
    initial: "selectType",
    context: {
      type: "jukebox",
      title: "My Room",
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
      },
      redirectToLogin: (ctx, event) => {
        if (event.type === "NEXT") {
          navigate(
            `${process.env.GATSBY_API_URL}/login?roomType=${ctx.type}&roomTitle=${ctx.title}&redirect=/rooms/create`,
          )
        }
      },
    },
  },
)
