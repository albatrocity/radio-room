import { createMachine, assign } from "xstate"
import socketService from "../lib/socketService"
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
  | { type: "SET_IDS"; data?: string[] }
  | { type: "SET_ACCESS_TOKEN"; data?: string }
  | {
      type: "SPOTIFY_AUTHENTICATION_STATUS"
      data?: {
        isAuthenticated: boolean
      }
    }
  | { type: "CHECK" }
  | { type: "done.invoke.checking"; data: CheckedSavedTracksResponse }
  | { type: "INIT"; data: { accessToken?: string } }
  | { type: "SPOTIFY_ACCESS_TOKEN_REFRESHED"; data: { accessToken?: string } }

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
    invoke: [
      {
        id: "socket",
        src: () => socketService,
      },
    ],
    on: {
      INIT: {
        actions: ["assignAccessToken"],
        target: "initial",
        cond: "hasAccessToken",
      },
      SPOTIFY_ACCESS_TOKEN_REFRESHED: {
        actions: ["assignAccessToken"],
        target: "initial",
        cond: "hasAccessToken",
      },
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
        on: {
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
      setCheckedTracks: assign((ctx, event) => {
        if (
          event.type === "CHECK" ||
          event.type === "ADD" ||
          event.type === "REMOVE" ||
          event.type === "SET_IDS" ||
          event.type === "SPOTIFY_AUTHENTICATION_STATUS"
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
      setIds: assign((ctx, event) => {
        if (event.type === "SET_IDS") {
          return {
            ids: event.data ?? ctx.ids,
          }
        }
        return ctx
      }),
      assignAccessToken: assign({
        accessToken: (ctx, event) => {
          if (
            event.type === "SPOTIFY_ACCESS_TOKEN_REFRESHED" ||
            event.type === "INIT"
          ) {
            return event.data.accessToken ?? ctx.accessToken
          }
          return ctx.accessToken
        },
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
      canFetch: (ctx, e) => {
        return !!ctx.accessToken && ctx.ids && ctx.ids.length > 0
      },
      cannotFetch: (ctx) => {
        return !ctx.accessToken || !ctx.ids || ctx.ids.length === 0
      },
      hasAccessToken: (ctx, event) => {
        if (
          event.type === "INIT" ||
          event.type === "SPOTIFY_ACCESS_TOKEN_REFRESHED"
        ) {
          return !!event.data.accessToken
        }
        return !!ctx.accessToken
      },
    },
  },
)

export default spotifyAddToLibraryMachine
