import { createMachine, assign } from "xstate"
import socketService from "../lib/socketService"
import { sortBy, uniqBy, reject, find } from "lodash/fp"
import { User } from "../types/User"

interface Context {
  listeners: User[]
  dj: User | null
  users: User[]
  currentUser: User | null
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
      currentUser: null,
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
      SET_CURRENT_USER: {
        actions: ["setCurrentUser"],
      },
      LOGIN: {
        actions: ["setUsers", "setCurrentUser"],
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
      setCurrentUser: assign({
        currentUser: (_context, event) => {
          return event.data.currentUser
        },
      }),
      setUsers: assign({
        currentUser: (context, event) => {
          return event.data.currentUser
            ? event.data.currentUser
            : context.currentUser
        },
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
