import { Machine, interpret, assign, send } from "xstate"
import { isNil } from "lodash/fp"
import socketService from "../lib/socketService"

export const dataMachine = Machine(
  {
    id: "data",
    initial: "disconnected",
    context: {
      currentUser: {},
      users: [],
      reactions: { message: {}, track: {} },
      playlist: [],
      messages: [],
    },
    invoke: [
      {
        id: "socket",
        src: (ctx, event) => socketService,
      },
    ],
    states: {
      disconnected: {
        on: {
          INIT: {
            target: "connected",
            actions: ["setData", "log"],
          },
        },
      },
      connected: {
        on: {
          REACTIONS: {
            actions: ["setReactions", "log"],
          },
          USER_JOINED: {
            actions: ["setUsers"],
          },
          USER_LEFT: {
            actions: ["setUsers"],
          },
          PLAYLIST: {
            actions: ["setPlaylist"],
          },
        },
      },
    },
  },
  {
    actions: {
      log: (ctx, event) => console.log("dataMachine event", event),
      setData: assign((ctx, event) => {
        console.log("setData even", event)
        return {
          users: event.data.users ? event.data.users : ctx.users,
          messages: event.data.messages ? event.data.messages : ctx.messages,
          reactions: event.data.reactions
            ? event.data.reactions
            : ctx.reactions,
          playlist: event.data.playlist ? event.data.playlist : ctx.playlist,
          currentUser: event.data.currentUser
            ? event.data.currentUser
            : ctx.currentUser,
        }
      }),
      setUsers: assign((ctx, event) => {
        return {
          users: event.data.users ? event.data.users : ctx.users,
        }
      }),
      setReactions: assign((ctx, event) => ({
        reactions: event.data.reactions ? event.data.reactions : ctx.reactions,
      })),
      setPlaylist: assign((ctx, event) => ({
        playlist: event.data.playlist ? event.data.playlist : ctx.playlist,
      })),
    },
    guards: {
      shouldRetry: ctx => ctx.shouldRetry,
    },
  }
)

export const dataService = interpret(dataMachine)

dataService.start()
