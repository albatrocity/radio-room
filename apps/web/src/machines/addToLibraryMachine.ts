import { createMachine, assign } from "xstate"
import { toast } from "../lib/toasts"
import { emitToSocket } from "../actors/socketActor"

interface Context {
  ids: string[]
  tracks: Record<string, boolean>
}

type Event =
  | { type: "ADD"; data?: string[] }
  | { type: "REMOVE"; data?: string[] }
  | { type: "SET_IDS"; data?: string[] }
  | { type: "CHECK" }
  | { type: "CHECK_SAVED_TRACKS_RESULTS"; data: { results: boolean[]; trackIds: string[] } }
  | { type: "CHECK_SAVED_TRACKS_FAILURE"; data: { message: string } }
  | { type: "ADD_TO_LIBRARY_SUCCESS"; data: { trackIds: string[] } }
  | { type: "ADD_TO_LIBRARY_FAILURE"; data: { message: string } }
  | { type: "REMOVE_FROM_LIBRARY_SUCCESS"; data: { trackIds: string[] } }
  | { type: "REMOVE_FROM_LIBRARY_FAILURE"; data: { message: string } }

// NOTE: This machine requires socket events. Use with useSocketMachine hook.
const addToLibraryMachine = createMachine<Context, Event>(
  {
    id: "addToLibrary",
    initial: "initial",
    context: {
      ids: [],
      tracks: {},
    },
    on: {
      SET_IDS: {
        actions: ["setIds"],
        target: "loading.checking",
      },
      CHECK_SAVED_TRACKS_RESULTS: {
        target: "checked",
        actions: ["setCheckedTracks"],
      },
      CHECK_SAVED_TRACKS_FAILURE: {
        target: "error",
        // NOTE: Don't show error toast for unsupported services (graceful handling)
        // actions: ["showError"],
      },
      ADD_TO_LIBRARY_SUCCESS: {
        target: "loading.checking",
        actions: ["showAddSuccess"],
      },
      ADD_TO_LIBRARY_FAILURE: {
        target: "error",
        actions: ["showError"],
      },
      REMOVE_FROM_LIBRARY_SUCCESS: {
        target: "loading.checking",
        actions: ["showRemoveSuccess"],
      },
      REMOVE_FROM_LIBRARY_FAILURE: {
        target: "error",
        actions: ["showError"],
      },
    },
    states: {
      initial: {
        always: [
          { target: "loading.checking", cond: "canFetch" },
          { target: "idle", cond: "cannotFetch" },
        ],
      },
      idle: {
        on: {
          SET_IDS: {
            actions: ["setIds"],
            target: "loading.checking",
          },
        },
      },
      loading: {
        states: {
          checking: {
            entry: ["sendCheckRequest"],
          },
          adding: {
            entry: ["sendAddRequest"],
          },
          removing: {
            entry: ["sendRemoveRequest"],
          },
        },
      },
      checked: {
        id: "checked",
        on: {
          CHECK: "loading.checking",
          ADD: "loading.adding",
          REMOVE: "loading.removing",
        },
      },
      error: {
        id: "error",
        on: {
          CHECK: "loading.checking",
          SET_IDS: {
            actions: ["setIds"],
            target: "loading.checking",
          },
        },
      },
    },
  },
  {
    actions: {
      sendCheckRequest: (ctx) => {
        emitToSocket("CHECK_SAVED_TRACKS", ctx.ids)
      },
      sendAddRequest: (ctx, event) => {
        const data = event.type === "ADD" ? event.data ?? ctx.ids : ctx.ids
        emitToSocket("ADD_TO_LIBRARY", data)
      },
      sendRemoveRequest: (ctx, event) => {
        const data = event.type === "REMOVE" ? event.data ?? ctx.ids : ctx.ids
        emitToSocket("REMOVE_FROM_LIBRARY", data)
      },
      setCheckedTracks: assign((ctx, event) => {
        if (event.type === "CHECK_SAVED_TRACKS_RESULTS") {
          return {
            tracks: event.data.trackIds.reduce(
              (acc, id, index) => {
                acc[id] = event.data.results[index]
                return acc
              },
              { ...ctx.tracks },
            ),
          }
        }
        return ctx
      }),
      setIds: assign((ctx, event) => {
        if (event.type === "SET_IDS") {
          return {
            ids: event.data ?? ctx.ids,
          }
        }
        return ctx
      }),
      showAddSuccess: () => {
        toast({
          title: "Added to your library",
          status: "success",
        })
      },
      showRemoveSuccess: () => {
        toast({
          title: "Removed from your library",
          status: "success",
        })
      },
      showError: (ctx, event) => {
        if (
          event.type === "CHECK_SAVED_TRACKS_FAILURE" ||
          event.type === "ADD_TO_LIBRARY_FAILURE" ||
          event.type === "REMOVE_FROM_LIBRARY_FAILURE"
        ) {
          toast({
            title: "Error",
            description: event.data.message,
            status: "error",
          })
        }
      },
    },
    guards: {
      canFetch: (ctx) => {
        return ctx.ids && ctx.ids.length > 0
      },
      cannotFetch: (ctx) => {
        return !ctx.ids || ctx.ids.length === 0
      },
    },
  },
)

export default addToLibraryMachine

