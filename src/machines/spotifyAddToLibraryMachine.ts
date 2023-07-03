import { createMachine, assign } from "xstate"
import {
  CheckedSavedTracksResponse,
  checkSavedTracks as apiCheck,
  addSavedTracks as apiAdd,
  removeSavedTracks as apiRemove,
} from "../lib/spotify/spotifyApi"
import { toast } from "../lib/toasts"

interface Context {
  ids: string[]
  accessToken?: string
  tracks: Record<string, boolean>
}

type Event =
  | { type: "ADD"; data?: string[] }
  | { type: "REMOVE"; data?: string[] }
  | { type: "CHECK" }
  | { type: "done.invoke.checking"; data: CheckedSavedTracksResponse }

async function checkSavedTracks(ctx: Context) {
  if (!ctx.accessToken) {
    throw new Error("No access token found")
  }
  const res = await apiCheck({ accessToken: ctx.accessToken, ids: ctx.ids })
  return res
}

async function addSavedTracks(ctx: Context, event: Event) {
  if (!ctx.accessToken) {
    throw new Error("No access token found")
  }
  if (event.type == "ADD") {
    await apiAdd({
      accessToken: ctx.accessToken,
      ids: event.data ?? ctx.ids,
    })
    return ctx.ids
  }
  return ctx.ids
}

async function removeSavedTracks(ctx: Context, event: Event) {
  if (!ctx.accessToken) {
    throw new Error("No access token found")
  }
  if (event.type == "REMOVE") {
    await apiRemove({
      accessToken: ctx.accessToken,
      ids: event.data ?? ctx.ids,
    })
    return ctx.ids
  }
  return ctx.ids
}

const spotifyAddToLibraryMachine = createMachine<Context, Event>(
  {
    id: "spotifyAddToLibrary",
    initial: "initial",
    context: {
      ids: [],
      tracks: {},
      accessToken: undefined,
    },
    states: {
      initial: {
        always: [
          { target: "loading.checking", cond: "canFetch" },
          { target: "error", cond: "cannotFetch" },
        ],
      },
      loading: {
        states: {
          checking: {
            entry: ["notifyAction"],
            invoke: {
              src: checkSavedTracks,
              onDone: "#checked",
              onError: "#error",
            },
          },
          adding: {
            invoke: {
              src: addSavedTracks,
              onDone: "checking",
              onError: "#error",
            },
          },
          removing: {
            invoke: {
              src: removeSavedTracks,
              onDone: "checking",
              onError: "#error",
            },
          },
        },
      },
      checked: {
        id: "checked",
        entry: ["setCheckedTracks"],
        on: {
          CHECK: "loading.checking",
          ADD: "loading.adding",
          REMOVE: "loading.removing",
        },
      },
      error: {
        id: "error",
        type: "final",
      },
    },
  },
  {
    actions: {
      setCheckedTracks: assign((ctx, event) => {
        if (
          event.type === "CHECK" ||
          event.type === "ADD" ||
          event.type === "REMOVE"
        ) {
          return ctx
        }
        return {
          tracks: ctx.ids.reduce(
            (acc, id, index) => {
              acc[id] = event.data[index]
              return acc
            },
            { ...ctx.tracks },
          ),
        }
      }),
      notifyAction: (ctx, event) => {
        const label = ctx.ids.length > 1 ? "tracks" : "track"
        const action = event.type.includes("adding") ? "Added" : "Removed"
        const conjunction = event.type.includes("adding") ? "to" : "from"

        if (event.type.includes("removing") || event.type.includes("adding")) {
          toast({
            title: `${action} ${label} ${conjunction} your Spotify library`,
            status: "success",
          })
        }
      },
    },
    guards: {
      canFetch: (ctx) => {
        return !!ctx.accessToken && ctx.ids && ctx.ids.length > 0
      },
      cannotFetch: (ctx) => {
        return !ctx.accessToken || !ctx.ids || ctx.ids.length === 0
      },
      isAuthenticated: (ctx) => {
        return !!ctx.accessToken
      },
      isUnauthenticated: (ctx) => {
        return !ctx.accessToken
      },
    },
  },
)

export default spotifyAddToLibraryMachine
