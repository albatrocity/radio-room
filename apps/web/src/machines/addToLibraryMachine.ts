import { setup, assign } from "xstate"
import { toast } from "../lib/toasts"
import { emitToSocket } from "../actors/socketActor"
import { MetadataSourceType } from "../types/Queue"

interface Context {
  ids: string[]
  tracks: Record<string, boolean>
  targetService?: MetadataSourceType
}

type Event =
  | { type: "ADD"; data?: string[]; targetService?: MetadataSourceType }
  | { type: "REMOVE"; data?: string[]; targetService?: MetadataSourceType }
  | { type: "SET_IDS"; data?: string[]; targetService?: MetadataSourceType }
  | { type: "CHECK" }
  | { type: "CHECK_SAVED_TRACKS_RESULTS"; data: { results: boolean[]; trackIds: string[] } }
  | { type: "CHECK_SAVED_TRACKS_FAILURE"; data: { message: string } }
  | { type: "ADD_TO_LIBRARY_SUCCESS"; data: { trackIds: string[] } }
  | { type: "ADD_TO_LIBRARY_FAILURE"; data: { message: string } }
  | { type: "REMOVE_FROM_LIBRARY_SUCCESS"; data: { trackIds: string[] } }
  | { type: "REMOVE_FROM_LIBRARY_FAILURE"; data: { message: string } }

// NOTE: This machine requires socket events. Use with useSocketMachine hook.
const addToLibraryMachine = setup({
  types: {
    context: {} as Context,
    events: {} as Event,
  },
  actions: {
    sendCheckRequest: ({ context }) => {
      emitToSocket("CHECK_SAVED_TRACKS", {
        trackIds: context.ids,
        targetService: context.targetService,
      })
    },
    sendAddRequest: ({ context, event }) => {
      const data = event.type === "ADD" ? event.data ?? context.ids : context.ids
      const targetService =
        event.type === "ADD" ? event.targetService ?? context.targetService : context.targetService
      emitToSocket("ADD_TO_LIBRARY", { trackIds: data, targetService })
    },
    sendRemoveRequest: ({ context, event }) => {
      const data = event.type === "REMOVE" ? event.data ?? context.ids : context.ids
      const targetService =
        event.type === "REMOVE"
          ? event.targetService ?? context.targetService
          : context.targetService
      emitToSocket("REMOVE_FROM_LIBRARY", { trackIds: data, targetService })
    },
    setCheckedTracks: assign(({ context, event }) => {
      if (event.type === "CHECK_SAVED_TRACKS_RESULTS") {
        return {
          tracks: event.data.trackIds.reduce(
            (acc, id, index) => {
              acc[id] = event.data.results[index]
              return acc
            },
            { ...context.tracks },
          ),
        }
      }
      return {}
    }),
    setIds: assign(({ context, event }) => {
      if (event.type === "SET_IDS") {
        return {
          ids: event.data ?? context.ids,
          targetService: event.targetService ?? context.targetService,
        }
      }
      return {}
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
    showError: ({ event }) => {
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
    canFetch: ({ context }) => {
      return context.ids && context.ids.length > 0
    },
    cannotFetch: ({ context }) => {
      return !context.ids || context.ids.length === 0
    },
  },
}).createMachine({
  id: "addToLibrary",
  initial: "initial",
  context: {
    ids: [],
    tracks: {},
    targetService: undefined,
  },
  on: {
    SET_IDS: {
      actions: ["setIds"],
      target: ".loading.checking",
    },
    CHECK_SAVED_TRACKS_RESULTS: {
      target: ".checked",
      actions: ["setCheckedTracks"],
    },
    CHECK_SAVED_TRACKS_FAILURE: {
      target: ".error",
      // NOTE: Don't show error toast for unsupported services (graceful handling)
      // actions: ["showError"],
    },
    ADD_TO_LIBRARY_SUCCESS: {
      target: ".loading.checking",
      actions: ["showAddSuccess"],
    },
    ADD_TO_LIBRARY_FAILURE: {
      target: ".error",
      actions: ["showError"],
    },
    REMOVE_FROM_LIBRARY_SUCCESS: {
      target: ".loading.checking",
      actions: ["showRemoveSuccess"],
    },
    REMOVE_FROM_LIBRARY_FAILURE: {
      target: ".error",
      actions: ["showError"],
    },
  },
  states: {
    initial: {
      always: [
        { target: "loading.checking", guard: "canFetch" },
        { target: "idle", guard: "cannotFetch" },
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
      initial: "checking",
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
        ADD: "loading.adding",
        REMOVE: "loading.removing",
        SET_IDS: {
          actions: ["setIds"],
          target: "loading.checking",
        },
      },
    },
  },
})

export default addToLibraryMachine
