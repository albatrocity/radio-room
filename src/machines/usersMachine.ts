import { createMachine, assign } from "xstate"
import socketService from "../lib/socketService"
import { sortBy, uniqBy, reject, find } from "lodash/fp"
import { User } from "../types/User"

interface Context {
  listeners: User[]
  dj: User | null
  users: User[]
}

export const usersMachine = createMachine<Context>(
  {
    predictableActionArguments: true,
    id: "users",
    initial: "connected",
    context: {
      users: [],
      dj: null,
      listeners: [],
    },
    invoke: [
      {
        id: "socket",
        src: () => socketService,
      },
    ],
    on: {
      USER_JOINED: {
        actions: ["setUsers"],
      },
      USER_LEFT: {
        actions: ["setUsers"],
      },
      KICK_USER: {
        actions: ["kickUser"],
      },
      SET_USERS: {
        actions: ["setUsers"],
      },
      SET_DATA: {
        actions: ["setUsers"],
      },
      INIT: {
        actions: ["setUsers"],
      },
    },
    states: {
      connected: {},
    },
  },
  {
    actions: {
      setUsers: assign({
        users: (_context, event) => {
          return event.data.users
        },
        listeners: (_context, event) => {
          return sortBy(
            "connectedAt",
            uniqBy("userId", reject({ isDj: true }, event.data.users)),
          )
        },
        dj: (_context, event) => find({ isDj: true }, event.data.users),
      }),
    },
  },
)
